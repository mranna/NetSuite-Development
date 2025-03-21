/**
* @NApiVersion 2.1
* @NScriptType Restlet
**/

/**
* Author: Hemanth Anil
* Created: 10th December 2024
**/

define (['N/record','N/log','N/util', 'N/search'], function(record, log, util, search) {

function getVendorBankDetails(requestParams = {}){
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
          'custrecord_2663_parent_vendor',
          'internalid',
          'name',
          'custrecord_2663_entity_acct_no',
          'custrecord_2663_entity_branch_no',
          'custrecord_2663_entity_bank_no'
    ]
  });
    const searchResults = bankSearch.run().getRange({start: offset, end: offset + limit});
   
    const bankAccounts = searchResults.map(result => ({

      vendor_internalID: result.getValue({name: 'custrecord_2663_parent_vendor'}),
      vendorbankId: result.getValue({name: 'internalid'}),
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
      title: 'Error in getVendorBankDetails function',
      details: `Error fetching all Vendor Bank details with params ${JSON.stringify(requestParams)}: ${error.message}`
    });
    return JSON.stringify({
      success: false,
      message: `Error fetching all Vendor Bank details: ${error.message}`
    });
  }
}
/***
Can update multiple records for current vendors.

***/
function doPut(requestBody){
  const results = [];

  try {
    requestBody.forEach((recordData) =>{

    const{
        vendorbankID,
        vendor_internalID,
        name,
        bankAccountNumber,
        branchNumber,
        bankNumber,
      } = recordData;    

      if (!vendorbankID) {
        results.push({success:false, message: 'Vendor Bank ID is required.'});
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
          id: vendorbankID
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
        results.push({success:true, message:'Record updated successfully.', vendorbankID});
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
Can update multiple records for new vendors
***/
function doPost(requestBody){
  const results =[];

  try {
    requestBody.forEach((recordData) =>{
      const{vendor_internalID, name, bankNumber, bankAccountNumber, branchNumber} = recordData;

      if (!vendor_internalID || !name || !bankAccountNumber || !bankNumber ||!branchNumber) {
        results.push({success: false, message: 'Missing required fields.', recordData});
        return;
      }
      try {
        const newRecord = record.create({
          type: 'CUSTOMRECORD_2663_ENTITY_BANK_DETAILS',
          isDynamic:true
        });
        newRecord.setValue({fieldId: 'custrecord_2663_parent_vendor', value:vendor_internalID});
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
          vendorbankId: recordId
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
  get:getVendorBankDetails,
  post:doPost,
  put:doPut,
};
});



