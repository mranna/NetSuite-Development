/**
* @NApiVersion 2.1
* @NScriptType WorkflowActionScript
*
**/

/**
* Created by Hemanth Anil
* To assign subsidiaries to the Vendor Record.
**/

define (['N/record', 'N/search'], function(record, search){
    function onAction(scriptContext){
        
        try{
            var vendorRecord = scriptContext.newRecord;
            var vendorId = vendorRecord.id;
            log.debug("Script Triggered", "Vendor ID: " + vendorId);
         
            var subsidiarySearch = search.create({
                type: search.Type.SUBSIDIARY,
                columns: ['internalid'] 
            });
            var subsidiaryIds = [];
            subsidiarySearch.run().each(function(result){
            return true;

            });
            log.debug("Subsidiary found : ", subsidiaryIds);
            if (subsidiaryIds.length > 0){
               vendorRecord.setValue({
                   fieldId: 'subsidiary',
                   value: subsidiaryIds
              
               });
            vendorRecord.save();
            log.debug("Vendor Successfully updated with Subsidiaries");
            }else{
              log.debug("No Subsidiaries found");
            }

       } catch(e) {
          log.error("Error Assigning Subsidiaries", e);
         }

       }
     return {
          onAction: onAction
      };

});