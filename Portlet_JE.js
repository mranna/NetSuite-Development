/**
* @NApiVersion 2.1
* @NScriptType Portlet
**/

define(['N/search', 'N/runtime'], function(search, runtime){
  function render(params){
    
	    var portlet = params.portlet;
        var savedSearchId = 'customsearch_approvaldashboardportlet';
        var pendingSearch = search.load({id: savedSearchId});

        var journalEntries = [];
        var transactionCount = 0;
    
        pendingSearch.run().each(function(result) {
          var journalId = result.getValue({name:'internalId'});
          var tranid = result.getValue({name:'tranid'});
          var journalDate = result.getValue({name: 'trandate'});
          var primaryApprover = result.getText({name: 'custbody3'});
          var nextApprover = result.getValue({name: 'nextapprover'});
          var amount = result.getValue({name: 'amount'});
          var subsidiary = result.getText({name: 'subsidiary'});
          var createdBy = result.getText({name: 'createdBy'});

          if (primaryApprover !== '-1' || nextApprover !== '-1') {  // To handle empty next approvers and remove duplicates
            if (!journalEntries[journalId]) {
              journalEntries[journalId] = {
                id: journalId,
                tranid: tranid,
                date: journalDate,
                approver: (primaryApprover !== '-1' ? primaryApprover : nextApprover),
                amount: amount,
                createdBy: createdBy,
                subsidiary: subsidiary,
                url: 'https://7072395-sb1.app.netsuite.com/app/accounting/transactions/journal.nl?id='+journalId
              };
              transactionCount++;
            }
            

          }
        return true;
        });
       portlet.title = "My Journal Entries to Approve (" + transactionCount + ")";

       var htmlContent = '';

       htmlContent += '<style>';
       htmlContent += 'table {width: 100%; border-collapse: collapse; margin-top: 20px;}';
       htmlContent += 'th, td {padding: 10px; text-align: left; border: 1px solid #ddd}';
       htmlContent += 'th{background-color: #f4f4f4; font-weight: bold;}';
       htmlContent += '</style>';

       htmlContent += '<h2> Pending Journal Entries </h2>';
       htmlContent += '<table>';
       htmlContent += '<tr><th>Journal Entry</th><th>Date</th><th>Subsidiary</th><th>Submitter</th><th>Amount</th><th>Approver</th><th>Link</th></tr>';

       journalEntries.forEach(function(entry) {
         htmlContent += '<tr>';
         htmlContent += '<td>' + entry.tranid + '</td>';
         htmlContent += '<td>' + entry.date + '</td>';
         htmlContent += '<td>' + entry.subsidiary + '</td>';
         htmlContent += '<td>' + entry.createdBy + '</td>';
         htmlContent += '<td>' + entry.amount + '</td>'; 
         htmlContent += '<td>' + entry.approver + '</td>';
         htmlContent += '<td><a href="'+ entry.url + '"target="_blank">View Transaction</a></td>';
         htmlContent += '</tr>';


       });
      htmlContent += '</table>';

      portlet.html = htmlContent;

	}

return{
	render: render

};
 
});