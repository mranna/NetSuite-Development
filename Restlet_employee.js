/**
* @NApiVersion 2.1
* @NScriptType Restlet
**/

/**
* Author: Hemanth Anil
* Created: 10th December 2024
**/


define (['N/record','N/log','N/util', 'N/search'], function(record, log, util, search) {

  /**
  * doGetAll function to get all Employee Bank details from the custom record ''CUSTOMRECORD_2663_ENTITY_BANK_DETAILS''
  * offset and limit are optional parameters to get the records in a paginated way.
  */

  function doGetAll(requestParams = {}) {
    try {

      const offset = requestParams.offset ? parseInt(requestParams.offset, 10): 0;
      const limit = requestParams.limit ? parseInt(requestParams.limit, 10): 1000;

      const isValidNumber = /^\d+$/.test(requestParams.offset) && /^\d+$/.test(requestParams.limit);
      if (!isValidNumber || offset < 0 || limit <= 0) {
       return JSON.stringify({success: false, message: 'Invalid offset or limit.'});
     } 

      const bankSearch = search.create({
        type: 'CUSTOMRECORD_2663_ENTITY_BANK_DETAILS',
        columns: [
          'custrecord_2663_parent_employee',
          'internalid',
          'name',
          'custrecord_2663_entity_acct_no',
          'custrecord_2663_entity_branch_no',
          'custrecord_2663_entity_bank_no'
        ]
      });
      const searchResults = bankSearch.run().getRange({start: offset, end: offset + limit});
      const bankAccounts = searchResults.map(result => ({

         employee_internalID: result.getValue({name: 'custrecord_2663_parent_employee'}),
         employeebankId: result.getValue({name: 'internalid'}),
         name: result.getValue({name: 'name'}),
         bankAccountNumber: result.getValue({name: 'custrecord_2663_entity_acct_no'}),
         branchNumber: result.getValue({name: 'custrecord_2663_entity_branch_no'}),
         bankNumber: result.getValue({name: 'custrecord_2663_entity_bank_no'})
        
        
      }));
      return JSON.stringify({
        success: true,
        bankAccounts: bankAccounts
      });
        
    } catch (error) {
      log.error({
        title: 'Error in doGetAll function',
        details: `Error fetching all Employee Bank details with params ${JSON.stringify(requestParams)}: ${error.message}`
      });
      return JSON.stringify({
        success: false,
        message: `Error fetching all Employee Bank details: ${error.message}`
      });
    }
  }

/***
Can update multiple records for current employees.

***/
function doPut(requestBody){
  const results = [];

  try {
    requestBody.forEach((recordData) =>{

    const{
        employeebankID,
        employee_internalID,
        name,
        bankAccountNumber,
        branchNumber,
        bankNumber,
      } = recordData;    

      if (!employeebankID) {
        results.push({success:false, message: 'Employee Bank ID is required.'});
        return;
      }
      if (!bankAccountNumber || !util.isNumber(Number(bankAccountNumber))) {
        results.push({success:false, message: 'Bank Account Number is required and must be numeric.'})
        return;
      }
      if (!branchNumber || !util.isNumber(Number(branchNumber))) {
        results.push({success:false, message: 'Branch Number is required and must be numeric.'})
        return;
      }
      if (!bankNumber || !util.isNumber(Number(bankNumber))) {
        results.push({success:false, message: 'Bank Number is required and must be numeric.'})
        return;
      }
      try {
        const bankDetailsRecord = record.load({
          type:'CUSTOMRECORD_2663_ENTITY_BANK_DETAILS',
          id: employeebankID
        });

        if (name) {
           bankDetailsRecord.setValue({fieldId: 'name', value: name});
        }
        if (bankAccountNumber) {
           bankDetailsRecord.setValue({fieldId: 'custrecord_2663_entity_acct_no', value: bankAccountNumber});
        }
        if (branchNumber) {
           bankDetailsRecord.setValue({fieldId: 'custrecord_2663_entity_branch_no', value: branchNumber});
        }
        if (bankNumber) {
           bankDetailsRecord.setValue({fieldId: 'custrecord_2663_entity_bank_no', value:bankNumber});
        }
        bankDetailsRecord.save();
        results.push({success:true, message:'Record updated successfully.', employeebankID});
      } catch (err) {
        results.push({
          success:false,
          message: 'Error updating record.',
          error: err.message,
          recordData
        });
      }
    
    });
  } catch (error) {
    log.error('Error in PUT request', error.message);
    return JSON.stringify({success: false, message: error.message});
  }
  return JSON.stringify(results);
}
  
/***
Can update multiple records for new employees
***/
function doPost(requestBody){
  const results =[];

  try {
    requestBody.forEach((recordData) =>{
      const{employee_internalID, name, bankNumber, bankAccountNumber, branchNumber} = recordData;

      if (!employee_internalID || !name || !bankAccountNumber || !bankNumber ||!branchNumber) {
        results.push({success: false, message: 'Missing required fields.', recordData});
        return;
      }
      try {
        const newRecord = record.create({
          type: 'CUSTOMRECORD_2663_ENTITY_BANK_DETAILS',
          isDynamic:true
        });
        newRecord.setValue({fieldId: 'custrecord_2663_parent_employee', value:employee_internalID});
        newRecord.setValue({fieldId: 'name', value: name });
        newRecord.setValue({fieldId: 'custrecord_2663_entity_file_format', value: 167 });
        newRecord.setValue({fieldId: 'custrecord_2663_entity_bank_type', value: 1 });
        newRecord.setValue({fieldId: 'custrecord_2663_entity_acct_no', value: bankAccountNumber });
        newRecord.setValue({fieldId: 'custrecord_2663_entity_branch_no', value: branchNumber });
        newRecord.setValue({fieldId: 'custrecord_2663_entity_bank_no', value: bankNumber });

        const recordId = newRecord.save();
        results.push({
          success:true,
          message:'Record created successfully',
          employeebankId: recordId
        });
      } catch (err) {
        results.push({
          success:false,
          message: 'Error creating record',
          error: err.message,
          recordData,
        });
      }
    });
  } catch (error) {
    log.error('Error in POST request for Multiple data', error.message);
    return JSON.stringify({success: false, message: error.message});
  }
  return JSON.stringify(results)
}
  
return {
  get:doGetAll,
  post:doPost,
  put:doPut,
};
});