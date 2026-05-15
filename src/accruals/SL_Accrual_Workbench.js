/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

define([
  'N/ui/serverWidget',
  'N/search',
  'N/record',
  'N/redirect',
  'N/log',
  'N/format'
], (
  serverWidget,
  search,
  record,
  redirect,
  log,
  format
) => {

  /***********************
   * CONFIG - UPDATE THESE
   ***********************/

  const SAVED_SEARCH_ID = 'customsearch1254';

  const BATCH_RECORD_TYPE = 'customrecord_accrual_batch';

  // Replace this with your actual Service Period custom list script ID
  const SERVICE_PERIOD_LIST_SOURCE = 'customlist_service_period';

  const BATCH_FIELDS = {
    SUBSIDIARY: 'custrecord_accrual_subsidiary',
    ACCRUAL_DATE: 'custrecord_accrual_date',
    POSTING_PERIOD: 'custrecord_posting_period',
    REVERSAL_DATE: 'custrecord_reversal_date',
    LIABILITY_ACCOUNT: 'custrecord_accrual_liability_account',
    SERVICE_PERIOD: 'custrecord_service_period_to_process',
    CREATED_JE: 'custrecord_created_je',
    ERROR_MESSAGE: 'custrecord_error_message',
    STATUS: 'custrecord_status'
  };

  const VENDOR_BILL_FIELDS = {
    ACCRUAL_JE_CREATED: 'custbody_accrual_je_created',
    ACCRUAL_JE_NUMBER: 'custbody_accrual_je_number',

    // Create this field first:
    // Type = List/Record, List/Record = Transaction, Applies To = Vendor Bill
    ACCRUAL_JE_REFERENCE: 'custbody_accrual_je_reference'
  };

  // Optional. If you know the internal IDs of your custom status list values, add them here.
  // Leave blank if you do not want the script to update Status yet.
  const STATUS_VALUES = {
    COMPLETED: '',
    ERROR: ''
  };

  /***********************
   * MAIN ENTRY
   ***********************/

  function onRequest(context) {
    let data = {};
    let rows = [];
    let batchId = null;

    try {
      if (context.request.method === 'GET') {
        const form = buildForm({}, [], null);
        context.response.writePage(form);
        return;
      }

      const action = context.request.parameters.custpage_action;

      data = getRequestData(context.request);

      rows = getAccrualRows(data);

      if (action === 'preview') {
        const form = buildForm(data, rows, null);
        context.response.writePage(form);
        return;
      }

      if (action === 'create') {
        validateCreateData(data, rows);

        batchId = createAccrualBatch(data, rows);

        const jeId = createJournalEntry(data, rows);

        markVendorBillsProcessed(rows, jeId);

        updateBatchWithJE(batchId, jeId);

        redirect.toRecord({
          type: BATCH_RECORD_TYPE,
          id: batchId
        });

        return;
      }

      const form = buildForm(data, rows, 'No action selected.');
      context.response.writePage(form);

    } catch (e) {
      log.error('Accrual Workbench Error', e);

      if (batchId) {
        updateBatchError(batchId, e.message || JSON.stringify(e));
      }

      const form = buildForm(data, rows, e.message || JSON.stringify(e));
      context.response.writePage(form);
    }
  }

  /***********************
   * FORM / UI
   ***********************/

  function buildForm(data, rows, errorMessage) {
    const form = serverWidget.createForm({
      title: 'Accrual Workbench'
    });

    form.clientScriptModulePath = './CS_Accrual_Workbench.js';

    const actionField = form.addField({
      id: 'custpage_action',
      type: serverWidget.FieldType.TEXT,
      label: 'Action'
    });

    actionField.updateDisplayType({
      displayType: serverWidget.FieldDisplayType.HIDDEN
    });

    if (errorMessage) {
      const errorField = form.addField({
        id: 'custpage_error',
        type: serverWidget.FieldType.INLINEHTML,
        label: 'Error'
      });

      errorField.defaultValue =
        '<div style="color:#b00020;font-weight:bold;margin-bottom:12px;">' +
        escapeHtml(errorMessage) +
        '</div>';
    }

    const subsidiaryField = form.addField({
      id: 'custpage_subsidiary',
      type: serverWidget.FieldType.SELECT,
      label: 'Subsidiary',
      source: 'subsidiary'
    });

    const servicePeriodField = form.addField({
      id: 'custpage_service_period',
      type: serverWidget.FieldType.SELECT,
      label: 'Service Period',
      source: SERVICE_PERIOD_LIST_SOURCE
    });

    const accrualDateField = form.addField({
      id: 'custpage_accrual_date',
      type: serverWidget.FieldType.DATE,
      label: 'Accrual Date'
    });

    const postingPeriodField = form.addField({
      id: 'custpage_posting_period',
      type: serverWidget.FieldType.SELECT,
      label: 'Posting Period',
      source: 'accountingperiod'
    });

    const reversalDateField = form.addField({
      id: 'custpage_reversal_date',
      type: serverWidget.FieldType.DATE,
      label: 'Reversal Date'
    });

    const liabilityAccountField = form.addField({
      id: 'custpage_liability_account',
      type: serverWidget.FieldType.SELECT,
      label: 'Accrual Liability Account',
      source: 'account'
    });

    if (data.subsidiary) subsidiaryField.defaultValue = data.subsidiary;
    if (data.servicePeriod) servicePeriodField.defaultValue = data.servicePeriod;
    if (data.accrualDate) accrualDateField.defaultValue = data.accrualDate;
    if (data.postingPeriod) postingPeriodField.defaultValue = data.postingPeriod;
    if (data.reversalDate) reversalDateField.defaultValue = data.reversalDate;
    if (data.liabilityAccount) liabilityAccountField.defaultValue = data.liabilityAccount;

    const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const summaryField = form.addField({
      id: 'custpage_summary',
      type: serverWidget.FieldType.INLINEHTML,
      label: 'Summary'
    });

    summaryField.defaultValue =
      '<div style="margin:12px 0;font-weight:bold;">' +
      'Candidate Count: ' + rows.length +
      ' | Total Accrual Amount: ' + totalAmount.toFixed(2) +
      '</div>';

    addPreviewSublist(form, rows);

    form.addButton({
      id: 'custpage_preview_btn',
      label: 'Preview Candidates',
      functionName: 'previewCandidates'
    });

    form.addButton({
      id: 'custpage_create_je_btn',
      label: 'Create Accrual JE',
      functionName: 'createAccrualJE'
    });

    return form;
  }

  function addPreviewSublist(form, rows) {
    const sublist = form.addSublist({
      id: 'custpage_candidates',
      type: serverWidget.SublistType.LIST,
      label: 'Accrual Candidates'
    });

    sublist.addField({
      id: 'custpage_bill',
      type: serverWidget.FieldType.TEXT,
      label: 'Bill'
    });

    sublist.addField({
      id: 'custpage_vendor',
      type: serverWidget.FieldType.TEXT,
      label: 'Vendor'
    });

    sublist.addField({
      id: 'custpage_account',
      type: serverWidget.FieldType.TEXT,
      label: 'Account'
    });

    sublist.addField({
      id: 'custpage_amount',
      type: serverWidget.FieldType.CURRENCY,
      label: 'Amount'
    });

    sublist.addField({
      id: 'custpage_department',
      type: serverWidget.FieldType.TEXT,
      label: 'Department'
    });

    sublist.addField({
      id: 'custpage_class',
      type: serverWidget.FieldType.TEXT,
      label: 'Class'
    });

    sublist.addField({
      id: 'custpage_location',
      type: serverWidget.FieldType.TEXT,
      label: 'Location'
    });

    sublist.addField({
      id: 'custpage_notes',
      type: serverWidget.FieldType.TEXT,
      label: 'Notes'
    });

    rows.forEach((row, i) => {
      setSublistValueSafe(sublist, 'custpage_bill', i, row.documentNumber || row.billId);
      setSublistValueSafe(sublist, 'custpage_vendor', i, row.vendor);
      setSublistValueSafe(sublist, 'custpage_account', i, row.accountText || row.accountId);
      setSublistValueSafe(sublist, 'custpage_amount', i, row.amount);
      setSublistValueSafe(sublist, 'custpage_department', i, row.departmentText);
      setSublistValueSafe(sublist, 'custpage_class', i, row.classText);
      setSublistValueSafe(sublist, 'custpage_location', i, row.locationText);
      setSublistValueSafe(sublist, 'custpage_notes', i, row.memo);
    });
  }

  function setSublistValueSafe(sublist, fieldId, line, value) {
    if (value === null || value === undefined || value === '') return;

    sublist.setSublistValue({
      id: fieldId,
      line,
      value: String(value)
    });
  }

  /***********************
   * REQUEST DATA
   ***********************/

  function getRequestData(request) {
    return {
      subsidiary: request.parameters.custpage_subsidiary,
      servicePeriod: request.parameters.custpage_service_period,
      accrualDate: request.parameters.custpage_accrual_date,
      postingPeriod: request.parameters.custpage_posting_period,
      reversalDate: request.parameters.custpage_reversal_date,
      liabilityAccount: request.parameters.custpage_liability_account
    };
  }

  /***********************
   * SEARCH
   ***********************/

  function getAccrualRows(data) {
    const accrualSearch = search.load({
      id: SAVED_SEARCH_ID
    });

    if (data.subsidiary) {
      accrualSearch.filters.push(
        search.createFilter({
          name: 'subsidiary',
          operator: search.Operator.ANYOF,
          values: [data.subsidiary]
        })
      );
    }

    if (data.servicePeriod) {
      accrualSearch.filters.push(
        search.createFilter({
          name: 'custbody_service_period',
          operator: search.Operator.ANYOF,
          values: [data.servicePeriod]
        })
      );
    }

    const pagedData = accrualSearch.runPaged({
      pageSize: 1000
    });

    log.audit('Workbench Candidate Count', pagedData.count);

    const rows = [];

    pagedData.pageRanges.forEach(pageRange => {
      const page = pagedData.fetch({
        index: pageRange.index
      });

      page.data.forEach(result => {
        const amountRaw = result.getValue({ name: 'amount' });
        const amount = Math.abs(parseFloat(amountRaw || 0));

        if (!amount) return;

        rows.push({
          billId: result.id,

          documentNumber:
            result.getValue({ name: 'tranid' }) ||
            result.getValue({ name: 'transactionnumber' }) ||
            result.id,

          vendor:
            result.getText({ name: 'entity' }) ||
            result.getValue({ name: 'entity' }) ||
            '',

          accountId: result.getValue({ name: 'account' }),
          accountText:
            result.getText({ name: 'account' }) ||
            result.getValue({ name: 'account' }),

          amount,

          subsidiary: result.getValue({ name: 'subsidiary' }),

          departmentId: result.getValue({ name: 'department' }),
          departmentText:
            result.getText({ name: 'department' }) ||
            result.getValue({ name: 'department' }) ||
            '',

          classId: result.getValue({ name: 'class' }),
          classText:
            result.getText({ name: 'class' }) ||
            result.getValue({ name: 'class' }) ||
            '',

          locationId: result.getValue({ name: 'location' }),
          locationText:
            result.getText({ name: 'location' }) ||
            result.getValue({ name: 'location' }) ||
            '',

          memo: result.getValue({ name: 'custbody_accrual_notes' }) || ''
        });
      });
    });

    log.audit('Rows Returned', rows.length);

    return rows;
  }

  /***********************
   * VALIDATION
   ***********************/

  function validateCreateData(data, rows) {
    const missing = [];

    if (!data.subsidiary) missing.push('Subsidiary');
    if (!data.servicePeriod) missing.push('Service Period');
    if (!data.accrualDate) missing.push('Accrual Date');
    if (!data.postingPeriod) missing.push('Posting Period');
    if (!data.reversalDate) missing.push('Reversal Date');
    if (!data.liabilityAccount) missing.push('Accrual Liability Account');

    if (missing.length) {
      throw new Error('Missing required fields: ' + missing.join(', '));
    }

    if (!rows || !rows.length) {
      throw new Error('No accrual candidates found.');
    }

    rows.forEach(row => {
      if (!row.accountId) {
        throw new Error('Missing account for bill ' + (row.documentNumber || row.billId));
      }

      if (!row.amount) {
        throw new Error('Missing amount for bill ' + (row.documentNumber || row.billId));
      }

      if (row.subsidiary && String(row.subsidiary) !== String(data.subsidiary)) {
        throw new Error(
          'Bill ' + (row.documentNumber || row.billId) +
          ' subsidiary does not match selected subsidiary.'
        );
      }
    });
  }

  /***********************
   * CREATE ACCRUAL BATCH
   ***********************/

  function createAccrualBatch(data, rows) {
    const batch = record.create({
      type: BATCH_RECORD_TYPE,
      isDynamic: false
    });

    batch.setValue({
      fieldId: 'name',
      value: 'Accrual Batch - ' + new Date().toISOString()
    });

    batch.setValue({
      fieldId: BATCH_FIELDS.SUBSIDIARY,
      value: data.subsidiary
    });

    batch.setValue({
      fieldId: BATCH_FIELDS.ACCRUAL_DATE,
      value: parseNsDate(data.accrualDate)
    });

    batch.setValue({
      fieldId: BATCH_FIELDS.POSTING_PERIOD,
      value: data.postingPeriod
    });

    batch.setValue({
      fieldId: BATCH_FIELDS.REVERSAL_DATE,
      value: parseNsDate(data.reversalDate)
    });

    batch.setValue({
      fieldId: BATCH_FIELDS.LIABILITY_ACCOUNT,
      value: data.liabilityAccount
    });

    batch.setValue({
      fieldId: BATCH_FIELDS.SERVICE_PERIOD,
      value: data.servicePeriod
    });

    const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    if (BATCH_FIELDS.ERROR_MESSAGE) {
      batch.setValue({
        fieldId: BATCH_FIELDS.ERROR_MESSAGE,
        value: 'Created from Accrual Workbench. Candidate count: ' +
          rows.length + '. Total: ' + total.toFixed(2)
      });
    }

    return batch.save();
  }

  /***********************
   * CREATE JOURNAL ENTRY
   ***********************/

  function createJournalEntry(data, rows) {
    const je = record.create({
      type: record.Type.JOURNAL_ENTRY,
      isDynamic: true
    });

    je.setValue({
      fieldId: 'subsidiary',
      value: data.subsidiary
    });

    je.setValue({
      fieldId: 'trandate',
      value: parseNsDate(data.accrualDate)
    });

    je.setValue({
      fieldId: 'postingperiod',
      value: data.postingPeriod
    });

    je.setValue({
      fieldId: 'reversaldate',
      value: parseNsDate(data.reversalDate)
    });

    je.setValue({
      fieldId: 'memo',
      value: 'Accrual Workbench - prior period service accrual'
    });

    let total = 0;
    const creditGroups = {};

    rows.forEach(row => {
      total += Number(row.amount || 0);

      je.selectNewLine({
        sublistId: 'line'
      });

      je.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: row.accountId
      });

      je.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'debit',
        value: row.amount
      });

      setOptionalLineCoding(je, row);

      je.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'memo',
        value: 'Accrual for bill ' + (row.documentNumber || row.billId)
      });

      je.commitLine({
        sublistId: 'line'
      });

      const creditKey = [
        row.departmentId || '',
        row.classId || '',
        row.locationId || ''
      ].join('|');

      if (!creditGroups[creditKey]) {
        creditGroups[creditKey] = {
          amount: 0,
          departmentId: row.departmentId,
          classId: row.classId,
          locationId: row.locationId
        };
      }

      creditGroups[creditKey].amount += Number(row.amount || 0);
    });

    Object.keys(creditGroups).forEach(key => {
      const group = creditGroups[key];

      je.selectNewLine({
        sublistId: 'line'
      });

      je.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: data.liabilityAccount
      });

      je.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'credit',
        value: group.amount
      });

      setOptionalLineCoding(je, group);

      je.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'memo',
        value: 'Accrued liability for batch'
      });

      je.commitLine({
        sublistId: 'line'
      });
    });

    const jeId = je.save();

    log.audit('Accrual JE Created', {
      jeId,
      total,
      rows: rows.length
    });

    return jeId;
  }

  function setOptionalLineCoding(je, row) {
    if (row.departmentId) {
      je.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'department',
        value: row.departmentId
      });
    }

    if (row.classId) {
      je.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'class',
        value: row.classId
      });
    }

    if (row.locationId) {
      je.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'location',
        value: row.locationId
      });
    }
  }

  /***********************
   * UPDATE RECORDS
   ***********************/

  function markVendorBillsProcessed(rows, jeId) {
    const uniqueBillIds = [...new Set(rows.map(row => row.billId))];

    uniqueBillIds.forEach(billId => {
      record.submitFields({
        type: record.Type.VENDOR_BILL,
        id: billId,
        values: {
          [VENDOR_BILL_FIELDS.ACCRUAL_JE_CREATED]: true,
          [VENDOR_BILL_FIELDS.ACCRUAL_JE_NUMBER]: String(jeId),
          [VENDOR_BILL_FIELDS.ACCRUAL_JE_REFERENCE]: jeId
        },
        options: {
          enableSourcing: false,
          ignoreMandatoryFields: true
        }
      });
    });
  }

  function updateBatchWithJE(batchId, jeId) {
    const values = {
      [BATCH_FIELDS.CREATED_JE]: jeId,
      [BATCH_FIELDS.ERROR_MESSAGE]: ''
    };

    if (STATUS_VALUES.COMPLETED) {
      values[BATCH_FIELDS.STATUS] = STATUS_VALUES.COMPLETED;
    }

    record.submitFields({
      type: BATCH_RECORD_TYPE,
      id: batchId,
      values,
      options: {
        enableSourcing: false,
        ignoreMandatoryFields: true
      }
    });
  }

  function updateBatchError(batchId, message) {
    const values = {
      [BATCH_FIELDS.ERROR_MESSAGE]: message
    };

    if (STATUS_VALUES.ERROR) {
      values[BATCH_FIELDS.STATUS] = STATUS_VALUES.ERROR;
    }

    record.submitFields({
      type: BATCH_RECORD_TYPE,
      id: batchId,
      values,
      options: {
        enableSourcing: false,
        ignoreMandatoryFields: true
      }
    });
  }

  /***********************
   * HELPERS
   ***********************/

  function parseNsDate(value) {
    if (!value) return null;

    if (value instanceof Date) {
      return value;
    }

    return format.parse({
      value,
      type: format.Type.DATE
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    onRequest
  };
});