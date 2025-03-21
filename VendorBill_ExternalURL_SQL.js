/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

define(['N/query', 'N/log'], function(query, log) {
    function onRequest(context) {
        let vendorInternalId = context.request.parameters.vendor || '';
        log.debug('Request Parameters', context.request.parameters);
        log.debug('Vendor Internal ID from the request:', vendorInternalId);

        let responseHTML = '<html><head><title>Vendor Bill Status</title></head><body>';

        responseHTML += '<style>';
        responseHTML += 'table {width: 100%; border-collapse: collapse; margin-top: 20px;}';
        responseHTML += 'th, td {padding: 10px; text-align: left; border: 1px solid #ddd}';
        responseHTML += 'th {background-color: #f4f4f4; font-weight: bold;}';
        responseHTML += '</style>';

        responseHTML += '<h2>Vendor Bill Status</h2>';

      
        responseHTML += '<form method="GET">';
        responseHTML += '<input type="hidden" name="script" value="1528">';
        responseHTML += '<input type="hidden" name="deploy" value="1">';
        responseHTML += 'Select Vendor: <select name="vendor" onChange="this.form.submit()">';
        responseHTML += '<option value="">All Vendors--</option>';

        // Query Vendors
        let vendorQuery = "SELECT id, entityid, companyname FROM vendor ORDER BY entityid";
        let vendors = query.runSuiteQL({ query: vendorQuery }).asMappedResults();
        log.debug("Vendor Query Results", vendors);

        // Loop through Vendors
        vendors.forEach(vendor => {
            let vendorEntityID = vendor.entityid || vendor.companyname || 'Unknown';
            let selected = (vendor.id === vendorInternalId) ? 'selected' : '';
            responseHTML += `<option value="${vendor.id}" ${selected}>${vendorEntityID}</option>`;
        });
        responseHTML += '</select></form>';
        responseHTML += '<table>';
        responseHTML += '<tr><th>Vendor</th><th>Bill Number</th><th>Transaction Date</th><th>Amount</th><th>Status</th><th>Approval Status</th><th>Created By</th></tr>';

        // Query Vendor Bills
        let billQuery = `
        SELECT 
            vendor.entityid AS vendor_name, 
            transaction.transactionnumber AS bill_number, 
            transaction.tranid AS transaction_id,
            CASE
            WHEN transaction.custbody_sw_awa_approval_status LIKE '1%' THEN 'Pending Approval'
            WHEN transaction.custbody_sw_awa_approval_status LIKE '2%' THEN 'Not Submitted'
            WHEN transaction.custbody_sw_awa_approval_status LIKE '3%' THEN 'Approved'
            WHEN transaction.custbody_sw_awa_approval_status LIKE '4%' THEN 'Super Approved'
            WHEN transaction.custbody_sw_awa_approval_status LIKE '5%' THEN 'Rejected'
            END AS billapproval_status,
            CASE
            WHEN transaction.status = 'A' THEN 'Open'
            WHEN transaction.status = 'B' THEN 'Pending Approval'
            WHEN transaction.status = 'C' THEN 'Credit Initiated'
            WHEN transaction.status = 'D' THEN 'Cancelled/Voided'
            WHEN transaction.status = 'E' THEN 'Pending e-document generation'
            WHEN transaction.status = 'F' THEN 'Paid in Full/Closed'
            ELSE transaction.status
            END AS status,
            CASE 
            WHEN transaction.foreignamountunpaid != 0 THEN transaction.foreignamountunpaid 
            ELSE transaction.foreignamountpaid 
            END AS amount,
            employee.entityid AS Created_by
        FROM transaction
        JOIN vendor ON transaction.entity = vendor.id
        JOIN employee ON transaction.createdby = employee.id
        WHERE transaction.recordtype = 'vendorbill'
        `;
        let params = [];
        if (vendorInternalId) {
            billQuery += " AND transaction.entity = ?";
            params.push(vendorInternalId);
        }
        billQuery += " ORDER BY transaction.trandate DESC";

        log.debug("Bill Query", { query: billQuery, params: params });

        let billResults = query.runSuiteQL({ query: billQuery, params: params }).asMappedResults();
        log.debug("Bill Query Results", billResults);

        if (billResults.length === 0) {
            responseHTML += '<tr><td colspan="7">No Vendor Bills found.</td></tr>';
        } else {
            billResults.forEach(bill => {
                responseHTML += `<tr>
                    <td>${bill.vendor_name}</td>
                    <td>${bill.bill_number}</td>
                    <td>${bill.transaction_date}</td>
                    <td>${bill.amount}</td>
                    <td>${bill.status}</td>
                    <td>${bill.billapproval_status}</td>
                    <td>${bill.created_by}</td>
                </tr>`;
            });
        }
        responseHTML += '</table>';
        responseHTML += '</body></html>';
        context.response.write(responseHTML);
    }
    return { onRequest: onRequest };
});