/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */

define(['N/currentRecord'], (currentRecord) => {

  function pageInit(context) {
    // Required entry point
  }

  function previewCandidates() {
    const rec = currentRecord.get();

    rec.setValue({
      fieldId: 'custpage_action',
      value: 'preview'
    });

    document.forms[0].submit();
  }

  function createAccrualJE() {
    const confirmed = confirm(
      'Create the accrual journal entry for the displayed criteria?'
    );

    if (!confirmed) {
      return;
    }

    const rec = currentRecord.get();

    rec.setValue({
      fieldId: 'custpage_action',
      value: 'create'
    });

    document.forms[0].submit();
  }

  return {
    pageInit,
    previewCandidates,
    createAccrualJE
  };
});