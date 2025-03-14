/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

define(['N/ui/serverWidget', 'N/record', 'N/search'], function(serverWidget, record, search) {
    function onRequest(context){

        let vendorInternalId = context.request.parameters.vendor || '';
        log.debug('Request Parameters', context.request.parameters);
        log.debug(`vendorInternalId from the request: ', ${vendorInternalId}`);

        let responseHTML = '<html><head><title>Vendor Bill Status</title></head><body>';
        responseHTML += '<h2>Vendor Bill Status</h2>';


        responseHTML += '<form method="GET">';
        responseHTML += '<input type="hidden" name="script" value="1528">'
        responseHTML += '<input type="hidden" name="deploy" value="1">'
        responseHTML += 'Select Vendor: <select name="vendor" onChange="this.form.submit()">';
        responseHTML += '<option value="">All Vendors--</option>';

        let vendorDropdownSearch = search.create({
            type: 'vendor',
            columns: ['entityid', 'internalid']
        }); 

        vendorDropdownSearch.run().each(function(result){
            let entityId = result.getValue('entityid');
            let internalId = result.getValue('internalid');
            let isSelected = internalId == vendorInternalId ? 'selected' : '';
            responseHTML += `<option value="${internalId}" ${isSelected}>${entityId}</option>`;
            return true;    
        }
        );
        responseHTML += '</select></form>';
        responseHTML += '<table border="1"><tr><th>Vendor</th><th>Bill Number</th><th>Amount</th><th>Status</th></tr>';

        let filters = [];
        if(vendorInternalId){
            filters.push(['entity', 'anyof', [vendorInternalId]]);
        }


            let vendorBillSearch = search.create({
                type: 'vendorbill',
                filters: filters,
                columns: ['entity', 'transactionnumber', 'amount', 'status']
            }); 
      let results = vendorBillSearch.run().getRange({start: 0, end: 100});
      if (results.length === 0) {
        responseHTML += '<tr><td colspan="4"> No Vendor Bills found. </td></tr>';
      }
           else{
             
            results.forEach(result => {
                let vendor = result.getText({name: 'entity'});
                let billNumber = result.getValue({name: 'transactionnumber'});
                let amount = result.getValue({name: 'amount'});
                let status = result.getValue({name: 'status'});
                responseHTML += `<tr><td>${vendor}</td><td> ${billNumber}</td><td>${amount}</td><td>${status}</td></tr>`;
                return true;
            }); 
        }

            responseHTML += '</table></body></html>';
            context.response.write(responseHTML);
        }
    
    return {onRequest};
});