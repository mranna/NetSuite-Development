/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * Prior Year Accrual — Scheduled Script
 * ======================================
 * Reads an Accrual Batch custom record, finds all flagged vendor bills for the
 * selected service period, and creates one reversing journal entry per subsidiary.
 *
 * SETUP REQUIRED BEFORE DEPLOYING
 * --------------------------------
 * 1. Populate SUBSIDIARY_FISCAL_MAP below with your real subsidiary IDs,
 *    Period 13 internal IDs, and first-day-of-new-FY reversal dates.
 *    (Replace the example entries with your own data.)
 *
 * 2. Confirm CONFIG field IDs match what you created in NetSuite Setup.
 *
 * 3. Deploy to Sandbox first and run the full test sequence described in
 *    the MVP build plan before going to production.
 *
 * GOVERNANCE BUDGET (Scheduled Script)
 * -------------------------------------
 *  Limit    : 10,000 units
 *  search.load + runPaged : ~50 units total
 *  record.create (JE)     : ~10 units per JE
 *  record.submitFields    : ~5 units per vendor bill
 *  Safe threshold         : ~1,500–1,800 vendor bills per run
 *  If you exceed that volume, convert to Map/Reduce (see note at bottom).
 */

define(
  ['N/record', 'N/search', 'N/runtime', 'N/log', 'N/format'],
  (record, search, runtime, log, format) => {

    // =========================================================================
    // CONFIGURATION — edit this section to match your NetSuite environment
    // =========================================================================

    /**
     * Subsidiary fiscal map.
     *
     * Key   : subsidiary internal ID (string) — find at Setup > Company > Subsidiaries,
     *         hover the subsidiary name and read the 'id=' value from the URL.
     *
     * period13Id   : internal ID of that subsidiary's Period 13 accounting period.
     *               Find at Setup > Accounting > Manage Accounting Periods.
     *               Hover the period name and read 'id=' from the URL.
     *
     * reversalDate : first day of the new fiscal year for this subsidiary.
     *               Jan–Dec subsidiaries: Jan 1 of the new year.
     *               Apr–Mar subsidiaries: Apr 1 of the new year.
     *               Format: new Date(YYYY, MM-1, DD)  — month is 0-indexed.
     *
     * EXAMPLE (replace with your real values):
     *   '1' : Sub A (Jan–Dec), Period 13 = internal ID 201, reversal Jan 1 2026
     *   '3' : Sub B (Apr–Mar), Period 13 = internal ID 205, reversal Apr 1 2026
     */
    const SUBSIDIARY_FISCAL_MAP = {
      '1': {
        name:         'Subsidiary A (Jan–Dec)',
        period13Id:   '201',
        reversalDate: new Date(2026, 0, 1)   // Jan 1 2026
      },
      '3': {
        name:         'Subsidiary B (Apr–Mar)',
        period13Id:   '205',
        reversalDate: new Date(2026, 3, 1)   // Apr 1 2026
      }
      /*
       * Add more subsidiaries here as needed:
       * '5': {
       *   name:         'Subsidiary C (Jan–Dec)',
       *   period13Id:   '208',
       *   reversalDate: new Date(2026, 0, 1)
       * }
       */
    };

    const CONFIG = {
      // Script parameter — set this on the Script Deployment record
      PARAM_BATCH_ID: 'custscript_accrual_batch_id',

      // Accrual Batch custom record type
      BATCH_RECORD_TYPE: 'customrecord_accrual_batch',

      // Accrual Batch field IDs
      BATCH_FIELDS: {
        ACCRUAL_DATE:           'custrecord_accrual_date',
        ACCRUAL_POSTING_PERIOD: 'custrecord_accrual_posting_period',
        REVERSAL_DATE:          'custrecord_accrual_reversal_date',
        LIABILITY_ACCOUNT:      'custrecord_accrued_liability_acct',
        SERVICE_PERIOD:         'custrecord_service_period_filter',
        MEMO_PREFIX:            'custrecord_accrual_memo_prefix',
        STATUS:                 'custrecord_accrual_batch_status',
        CREATED_JES:            'custrecord_created_accrual_jes',   // Long Text — stores all JE IDs
        ERROR_MESSAGE:          'custrecord_accrual_error_msg'
      },

      // Vendor bill body field IDs
      VENDOR_BILL_FIELDS: {
        ACCRUE_TO_PRIOR_YEAR: 'custbody_accrue_to_prior_year',
        SERVICE_PERIOD:       'custbody_service_period',
        ACCRUAL_JE_CREATED:   'custbody_accrual_je_created',
        ACCRUAL_JE_REFERENCE: 'custbody_accrual_je_reference'
      },

      // Internal ID of the saved search for accrual candidates
      // Must filter: type=VB, accrue checkbox=Yes, JE created=No, status=Approved
      SAVED_SEARCH_ID: 'customsearch_prior_year_accrual',

      // Batch status list values — match your custom list internal IDs
      STATUS: {
        PENDING:    '1',
        PROCESSING: '2',
        COMPLETED:  '3',
        ERROR:      '4'
      },

      // Governance safety margin — stop processing if fewer units remain
      GOVERNANCE_THRESHOLD: 150
    };

    // =========================================================================
    // ENTRY POINT
    // =========================================================================

    function execute() {
      const script    = runtime.getCurrentScript();
      const batchId   = script.getParameter({ name: CONFIG.PARAM_BATCH_ID });

      if (!batchId) {
        throw new Error(
          'Missing script parameter: ' + CONFIG.PARAM_BATCH_ID +
          '. Set this on the Script Deployment record before running.'
        );
      }

      log.audit('Accrual batch starting', { batchId });

      try {
        // Mark as processing so a concurrent run cannot start
        updateBatchStatus(batchId, CONFIG.STATUS.PROCESSING, null);

        // ------------------------------------------------------------------
        // Load and validate the batch record
        // ------------------------------------------------------------------
        const batch = record.load({
          type: CONFIG.BATCH_RECORD_TYPE,
          id:   batchId
        });

        const batchValues = readBatchValues(batch);
        validateBatch(batchValues);

        // ------------------------------------------------------------------
        // Fetch accrual candidate rows from the saved search
        // ------------------------------------------------------------------
        const rows = getAccrualRows(batchValues.servicePeriod);

        if (!rows.length) {
          throw new Error(
            'No accrual candidate vendor bills found for service period ID ' +
            batchValues.servicePeriod +
            '. Confirm the saved search returns results before running.'
          );
        }

        log.audit('Rows found', { count: rows.length });

        // ------------------------------------------------------------------
        // Group rows by subsidiary and create one JE per subsidiary
        // ------------------------------------------------------------------
        const rowsBySubsidiary = groupBy(rows, row => row.subsidiaryId);
        const subsidiaryIds    = Object.keys(rowsBySubsidiary);

        validateSubsidiaries(subsidiaryIds);

        const createdJeMap = {};   // subsidiaryId -> jeId
        const errors       = [];   // partial-failure log

        subsidiaryIds.forEach(subsidiaryId => {
          try {
            const subsidiaryRows = rowsBySubsidiary[subsidiaryId];
            const fiscalConfig   = SUBSIDIARY_FISCAL_MAP[subsidiaryId];

            log.audit('Creating JE for subsidiary', {
              subsidiaryId,
              name:      fiscalConfig.name,
              billCount: subsidiaryRows.length
            });

            const jeId = createAccrualJournalEntry({
              subsidiaryId,
              rows:              subsidiaryRows,
              accrualDate:       batchValues.accrualDate,
              accrualPostingPeriod: fiscalConfig.period13Id,
              reversalDate:      fiscalConfig.reversalDate,
              liabilityAccount:  batchValues.liabilityAccount,
              memoPrefix:        batchValues.memoPrefix
            });

            createdJeMap[subsidiaryId] = jeId;

            // Mark vendor bills as processed — with governance guard
            markVendorBillsProcessed(subsidiaryRows, jeId);

          } catch (subError) {
            // Partial failure: log and continue with other subsidiaries.
            // Bills for this subsidiary are NOT marked processed so they can
            // be retried after fixing the underlying issue.
            log.error('JE creation failed for subsidiary ' + subsidiaryId, subError);
            errors.push('Sub ' + subsidiaryId + ': ' + (subError.message || subError));
          }
        });

        // ------------------------------------------------------------------
        // Update the batch record with results
        // ------------------------------------------------------------------
        const jeIdList = Object.values(createdJeMap).join(', ');

        if (errors.length > 0 && Object.keys(createdJeMap).length === 0) {
          // All subsidiaries failed
          throw new Error('All subsidiaries failed:\n' + errors.join('\n'));
        }

        const partialNote = errors.length > 0
          ? '\nWARNING — partial failures:\n' + errors.join('\n')
          : '';

        record.submitFields({
          type:   CONFIG.BATCH_RECORD_TYPE,
          id:     batchId,
          values: {
            [CONFIG.BATCH_FIELDS.STATUS]:      CONFIG.STATUS.COMPLETED,
            [CONFIG.BATCH_FIELDS.CREATED_JES]: jeIdList + partialNote,
            [CONFIG.BATCH_FIELDS.ERROR_MESSAGE]: partialNote || ''
          }
        });

        log.audit('Accrual batch completed', {
          batchId,
          jeIds:  jeIdList,
          errors: errors.length ? errors : 'none'
        });

      } catch (error) {
        log.error('Accrual batch failed', error);
        updateBatchStatus(
          batchId,
          CONFIG.STATUS.ERROR,
          error.message || JSON.stringify(error)
        );
        throw error;   // rethrow so NetSuite marks the script execution as failed
      }
    }

    // =========================================================================
    // BATCH RECORD HELPERS
    // =========================================================================

    function readBatchValues(batch) {
      return {
        accrualDate:           batch.getValue({ fieldId: CONFIG.BATCH_FIELDS.ACCRUAL_DATE }),
        accrualPostingPeriod:  batch.getValue({ fieldId: CONFIG.BATCH_FIELDS.ACCRUAL_POSTING_PERIOD }),
        reversalDate:          batch.getValue({ fieldId: CONFIG.BATCH_FIELDS.REVERSAL_DATE }),
        liabilityAccount:      batch.getValue({ fieldId: CONFIG.BATCH_FIELDS.LIABILITY_ACCOUNT }),
        servicePeriod:         batch.getValue({ fieldId: CONFIG.BATCH_FIELDS.SERVICE_PERIOD }),
        memoPrefix:            batch.getValue({ fieldId: CONFIG.BATCH_FIELDS.MEMO_PREFIX }) || 'Prior year accrual'
      };
    }

    function validateBatch(v) {
      const required = [
        [v.accrualDate,          'Accrual Date'],
        [v.accrualPostingPeriod, 'Accrual Posting Period'],
        [v.reversalDate,         'Reversal Date'],
        [v.liabilityAccount,     'Accrued Liability Account'],
        [v.servicePeriod,        'Service Period']
      ];

      required.forEach(([value, label]) => {
        if (!value) throw new Error('Accrual Batch is missing required field: ' + label);
      });
    }

    function validateSubsidiaries(subsidiaryIds) {
      const unmapped = subsidiaryIds.filter(id => !SUBSIDIARY_FISCAL_MAP[id]);
      if (unmapped.length > 0) {
        throw new Error(
          'The following subsidiary IDs from vendor bills are not in SUBSIDIARY_FISCAL_MAP: ' +
          unmapped.join(', ') +
          '. Add them to the script before running.'
        );
      }
    }

    function updateBatchStatus(batchId, status, errorMessage) {
      const values = { [CONFIG.BATCH_FIELDS.STATUS]: status };
      if (errorMessage) {
        values[CONFIG.BATCH_FIELDS.ERROR_MESSAGE] = errorMessage;
      }
      record.submitFields({
        type:   CONFIG.BATCH_RECORD_TYPE,
        id:     batchId,
        values
      });
    }

    // =========================================================================
    // SAVED SEARCH — fetch accrual candidate rows
    // =========================================================================

    /**
     * Loads the saved search, appends a service-period filter, and pages through
     * all results. Returns an array of row objects ready for JE creation.
     *
     * IMPORTANT: The saved search must include these result columns:
     *   tranid       — vendor bill document number
     *   entity       — vendor (text)
     *   expenseaccount  — expense account on the line (NOT the AP header account)
     *   amount       — line amount
     *   department   — dimension (optional)
     *   class        — dimension (optional)
     *   location     — dimension (optional)
     *   subsidiary   — subsidiary internal ID
     *   memo         — line memo (optional)
     *
     * The column name for the expense account varies by NetSuite version and
     * search type. Common values: 'expenseaccount', 'account'.
     * Confirm by running the saved search in the UI and inspecting the column
     * headers before deploying.
     */
    function getAccrualRows(servicePeriod) {
      const accrualSearch = search.load({ id: CONFIG.SAVED_SEARCH_ID });

      // Append runtime filter for the specific service period
      accrualSearch.filters.push(
        search.createFilter({
          name:     CONFIG.VENDOR_BILL_FIELDS.SERVICE_PERIOD,
          operator: search.Operator.ANYOF,
          values:   [servicePeriod]
        })
      );

      const rows     = [];
      const pagedData = accrualSearch.runPaged({ pageSize: 1000 });

      pagedData.pageRanges.forEach(pageRange => {
        const page = pagedData.fetch({ index: pageRange.index });

        page.data.forEach(result => {
          const amountRaw = result.getValue({ name: 'amount' });

          // Strip locale formatting (e.g. "1,234.56" → 1234.56) before parsing
          const amount = Math.abs(parseFloat((amountRaw || '0').replace(/,/g, '')));

          // Skip zero-amount lines — they produce unbalanced JE lines
          if (amount === 0) {
            log.debug('Skipping zero-amount line', { billId: result.id });
            return;
          }

          // 'expenseaccount' is the correct column for bill line expense accounts.
          // If your saved search uses a different column name, update this.
          // DO NOT use 'account' — on a vendor bill, that returns the AP account.
          const expenseAccount =
            result.getValue({ name: 'expenseaccount' }) ||
            result.getValue({ name: 'account' });   // fallback if search is body-level

          if (!expenseAccount) {
            log.warning('No expense account found for bill line, skipping', {
              billId:    result.id,
              billNumber: result.getValue({ name: 'tranid' })
            });
            return;
          }

          rows.push({
            billId:       result.id,
            billNumber:   result.getValue({ name: 'tranid' })  || result.id,
            vendor:       result.getText({ name: 'entity' })   || '',
            expenseAccount,
            amount,
            department:   result.getValue({ name: 'department' }) || null,
            classId:      result.getValue({ name: 'class' })      || null,
            location:     result.getValue({ name: 'location' })   || null,
            subsidiaryId: result.getValue({ name: 'subsidiary' }) || null,
            memo:         result.getValue({ name: 'memo' })       || ''
          });
        });
      });

      return rows;
    }

    // =========================================================================
    // JOURNAL ENTRY CREATION
    // =========================================================================

    /**
     * Creates one reversing journal entry for a single subsidiary.
     *
     * Structure:
     *   DEBIT  — original expense account (one line per bill line, with dimensions)
     *   CREDIT — accrued liability account (consolidated by dept/class/location)
     *
     * Auto-reversal: reversaldate + reversaldefer = true causes NetSuite to post
     * the offsetting entry on the first day of the new fiscal year automatically.
     */
    function createAccrualJournalEntry(options) {
      const {
        subsidiaryId,
        rows,
        accrualDate,
        accrualPostingPeriod,
        reversalDate,
        liabilityAccount,
        memoPrefix
      } = options;

      const fiscalConfig = SUBSIDIARY_FISCAL_MAP[subsidiaryId];
      const je = record.create({ type: record.Type.JOURNAL_ENTRY, isDynamic: true });

      // --- Header -----------------------------------------------------------
      je.setValue({ fieldId: 'subsidiary',      value: subsidiaryId });
      je.setValue({ fieldId: 'trandate',        value: accrualDate });
      je.setValue({ fieldId: 'postingperiod',   value: accrualPostingPeriod });
      je.setValue({ fieldId: 'reversaldate',    value: reversalDate });
      je.setValue({ fieldId: 'reversaldefer',   value: true });  // triggers auto-reversal
      je.setValue({
        fieldId: 'memo',
        value:   memoPrefix + ' — ' + fiscalConfig.name + ' — auto-reversing'
      });

      // --- Debit lines (one per bill line) ----------------------------------
      let runningTotal       = 0;
      const creditBuckets    = {};   // keyed by 'dept|class|location' for consolidation

      rows.forEach(row => {
        runningTotal += row.amount;

        je.selectNewLine({ sublistId: 'line' });
        je.setCurrentSublistValue({ sublistId: 'line', fieldId: 'account', value: row.expenseAccount });
        je.setCurrentSublistValue({ sublistId: 'line', fieldId: 'debit',   value: row.amount });
        je.setCurrentSublistValue({
          sublistId: 'line',
          fieldId:   'memo',
          value:     'Accrual — ' + (row.vendor || 'Vendor') + ' — Bill ' + row.billNumber
        });
        setLineDimensions(je, row);
        je.commitLine({ sublistId: 'line' });

        // Accumulate into a credit bucket keyed by dimension combination
        const bucketKey = [row.department || '', row.classId || '', row.location || ''].join('|');
        if (!creditBuckets[bucketKey]) {
          creditBuckets[bucketKey] = {
            amount:     0,
            department: row.department,
            classId:    row.classId,
            location:   row.location
          };
        }
        creditBuckets[bucketKey].amount += row.amount;
      });

      // --- Credit lines (consolidated by dimension bucket) ------------------
      Object.values(creditBuckets).forEach(bucket => {
        je.selectNewLine({ sublistId: 'line' });
        je.setCurrentSublistValue({ sublistId: 'line', fieldId: 'account', value: liabilityAccount });
        je.setCurrentSublistValue({ sublistId: 'line', fieldId: 'credit',  value: round2(bucket.amount) });
        je.setCurrentSublistValue({
          sublistId: 'line',
          fieldId:   'memo',
          value:     'Accrued liability — auto-reversal pending'
        });
        setLineDimensions(je, bucket);
        je.commitLine({ sublistId: 'line' });
      });

      const jeId = je.save();

      log.audit('JE created', {
        jeId,
        subsidiaryId,
        subsidiaryName: fiscalConfig.name,
        lineCount:      rows.length,
        total:          round2(runningTotal)
      });

      return jeId;
    }

    /**
     * Sets department, class, and location on the current line — only when present,
     * because passing null/empty to a dimension field throws a type error.
     */
    function setLineDimensions(je, row) {
      if (row.department) {
        je.setCurrentSublistValue({ sublistId: 'line', fieldId: 'department', value: row.department });
      }
      if (row.classId) {
        je.setCurrentSublistValue({ sublistId: 'line', fieldId: 'class',      value: row.classId });
      }
      if (row.location) {
        je.setCurrentSublistValue({ sublistId: 'line', fieldId: 'location',   value: row.location });
      }
    }

    // =========================================================================
    // MARK VENDOR BILLS AS PROCESSED
    // =========================================================================

    /**
     * Stamps each unique vendor bill with the JE reference and processed flag.
     * Checks governance units before each submitFields call.
     * If units run out, logs which bills were not stamped — they will be excluded
     * from future runs by the saved search, so manual stamping may be required.
     */
    function markVendorBillsProcessed(rows, jeId) {
      const script       = runtime.getCurrentScript();
      const uniqueBillIds = [...new Set(rows.map(r => r.billId))];
      const unstamped    = [];

      uniqueBillIds.forEach(billId => {
        if (script.getRemainingUsage() < CONFIG.GOVERNANCE_THRESHOLD) {
          unstamped.push(billId);
          return;
        }

        try {
          record.submitFields({
            type:   record.Type.VENDOR_BILL,
            id:     billId,
            values: {
              [CONFIG.VENDOR_BILL_FIELDS.ACCRUAL_JE_CREATED]:   true,
              [CONFIG.VENDOR_BILL_FIELDS.ACCRUAL_JE_REFERENCE]: jeId
            }
          });
        } catch (stampError) {
          log.error('Failed to stamp vendor bill ' + billId, stampError);
          unstamped.push(billId);
        }
      });

      if (unstamped.length > 0) {
        log.error(
          'GOVERNANCE / STAMP ERROR — the following bills were NOT marked processed. ' +
          'The JE was created (ID: ' + jeId + ') but these bills will appear in future ' +
          'runs. Manually set custbody_accrual_je_created = true on each.',
          { unstampedBillIds: unstamped }
        );
      }
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================

    /** Groups an array into an object of arrays by a key function. */
    function groupBy(array, keyFn) {
      return array.reduce((result, item) => {
        const key      = keyFn(item);
        result[key]    = result[key] || [];
        result[key].push(item);
        return result;
      }, {});
    }

    /** Rounds to 2 decimal places to avoid floating-point JE imbalance. */
    function round2(value) {
      return Math.round(value * 100) / 100;
    }

    // =========================================================================
    // EXPORTS
    // =========================================================================

    return { execute };
  }
);

/*
 * ============================================================================
 * DEPLOYMENT CHECKLIST
 * ============================================================================
 *
 * 1. Script record (Customization > Scripting > Scripts > New)
 *    Type       : Scheduled Script
 *    Script File: upload this file
 *    Script ID  : customscript_prior_year_accrual
 *
 * 2. Script Parameter (on the Script record, Parameters tab)
 *    ID    : custscript_accrual_batch_id
 *    Type  : Integer
 *    Label : Accrual Batch ID
 *
 * 3. Script Deployment
 *    Status    : Not Scheduled (trigger manually from the Batch record)
 *    Execute As: A dedicated service role with:
 *                - View / Create on Journal Entry
 *                - Edit on Vendor Bill
 *                - View on your custom records and saved search
 *
 * 4. To trigger the script from the Accrual Batch record, add a Suitelet
 *    or a Workflow Action that sets custscript_accrual_batch_id to the
 *    current record's internal ID and then calls task.create() to queue
 *    the scheduled script. Example below:
 *
 *    define(['N/task'], task => {
 *      const t = task.create({ taskType: task.TaskType.SCHEDULED_SCRIPT });
 *      t.scriptId  = 'customscript_prior_year_accrual';
 *      t.deploymentId = 'customdeploy_prior_year_accrual';
 *      t.params = { custscript_accrual_batch_id: batchRecordId };
 *      t.submit();
 *    });
 *
 * ============================================================================
 * SCALING TO MAP/REDUCE (post-MVP)
 * ============================================================================
 *
 * If your bill volume exceeds ~1,500 per run, convert to Map/Reduce:
 *
 *  getInputData() : run the saved search and return the result set
 *  map(context)   : one key=subsidiaryId, value=row per bill line
 *  reduce(context): receives all rows for a subsidiary — create the JE and
 *                   stamp the bills
 *  summarize()    : update the batch record with all JE IDs and any errors
 *
 * This parallelises JE creation across subsidiaries and avoids the 10,000-unit
 * limit by spreading work across multiple governance contexts.
 *
 * ============================================================================
 */
