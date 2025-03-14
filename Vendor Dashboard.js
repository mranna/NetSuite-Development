/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

 define(['N/query', 'N/log', 'N/ui/serverWidget', 'N/runtime'], function(query, log, serverWidget, runtime) {
    function onRequest(context) {
        let user = runtime.getCurrentUser();
        let vendorInternalId = context.request.parameters.vendor || '';
        let dateFrom = context.request.parameters.dateFrom || '';
        let dateTo = context.request.parameters.dateTo || '';
        let roleFilter = context.request.parameters.role || '';

        log.debug('Request Parameters', context.request.parameters);

        let form = serverWidget.createForm({ title: 'Vendor Dashboard' });

        // Vendor Dropdown
        let vendorField = form.addField({
            id: 'vendor',
            type: serverWidget.FieldType.SELECT,
            label: 'Select Vendor'
        });
        vendorField.addSelectOption({ value: '', text: 'All Vendors' });
        let vendorQuery = "SELECT id, entityid FROM vendor ORDER BY entityid";
        let vendors = query.runSuiteQL({ query: vendorQuery }).asMappedResults();
        vendors.forEach(vendor => {
            vendorField.addSelectOption({ value: vendor.id, text: vendor.entityid });
        });
        vendorField.defaultValue = vendorInternalId;

        // Role Dropdown
        let roleField = form.addField({
            id: 'role',
            type: serverWidget.FieldType.SELECT,
            label: 'Filter by Role'
        });
        roleField.addSelectOption({ value: '', text: 'All Roles' });
        let roles = ["Administrator", "Vendor Center", "Accountant", "Manager"];
        roles.forEach(role => {
            roleField.addSelectOption({ value: role, text: role });
        });
        roleField.defaultValue = roleFilter;

        // Date Fields
        form.addField({ id: 'dateFrom', type: serverWidget.FieldType.DATE, label: 'From' }).defaultValue = dateFrom;
        form.addField({ id: 'dateTo', type: serverWidget.FieldType.DATE, label: 'To' }).defaultValue = dateTo;

        form.addSubmitButton({ label: 'Filter' });

        // Vendor Bills Sublist
        let billSublist = form.addSublist({ id: 'vendor_bills', type: serverWidget.SublistType.LIST, label: 'Vendor Bills' });
        billSublist.addField({ id: 'vendor', type: serverWidget.FieldType.TEXT, label: 'Vendor' });
        billSublist.addField({ id: 'bill_number', type: serverWidget.FieldType.TEXT, label: 'Bill Number' });
        billSublist.addField({ id: 'date', type: serverWidget.FieldType.DATE, label: 'Date' });
        billSublist.addField({ id: 'amount', type: serverWidget.FieldType.CURRENCY, label: 'Amount' });
        billSublist.addField({ id: 'status', type: serverWidget.FieldType.TEXT, label: 'Status' });

        let billQuery = "SELECT vendor.entityid, transaction.tranid, transaction.trandate, transaction.total, transaction.status FROM transaction JOIN vendor ON transaction.entity = vendor.id WHERE transaction.recordtype = 'vendorbill'";
        let params = [];
        if (vendorInternalId) {
            billQuery += " AND transaction.entity = ?";
            params.push(vendorInternalId);
        }
        if (dateFrom) {
            billQuery += " AND transaction.trandate >= ?";
            params.push(dateFrom);
        }
        if (dateTo) {
            billQuery += " AND transaction.trandate <= ?";
            params.push(dateTo);
        }
        billQuery += " ORDER BY transaction.trandate DESC";
        let billResults = query.runSuiteQL({ query: billQuery, params: params }).asMappedResults();
        billResults.forEach((bill, index) => {
            billSublist.setSublistValue({ id: 'vendor', line: index, value: bill.entityid });
            billSublist.setSublistValue({ id: 'bill_number', line: index, value: bill.tranid });
            billSublist.setSublistValue({ id: 'date', line: index, value: bill.trandate });
            billSublist.setSublistValue({ id: 'amount', line: index, value: bill.total });
            billSublist.setSublistValue({ id: 'status', line: index, value: bill.status });
        });

        // Vendor Purchase Orders Sublist
        let poSublist = form.addSublist({ id: 'vendor_pos', type: serverWidget.SublistType.LIST, label: 'Vendor Purchase Orders' });
        poSublist.addField({ id: 'vendor', type: serverWidget.FieldType.TEXT, label: 'Vendor' });
        poSublist.addField({ id: 'po_number', type: serverWidget.FieldType.TEXT, label: 'PO Number' });
        poSublist.addField({ id: 'date', type: serverWidget.FieldType.DATE, label: 'Date' });
        poSublist.addField({ id: 'amount', type: serverWidget.FieldType.CURRENCY, label: 'Amount' });
        poSublist.addField({ id: 'status', type: serverWidget.FieldType.TEXT, label: 'Status' });

        let poQuery = "SELECT vendor.entityid, transaction.tranid, transaction.trandate, transaction.total, transaction.status FROM transaction JOIN vendor ON transaction.entity = vendor.id WHERE transaction.recordtype = 'purchaseorder'";
        let poResults = query.runSuiteQL({ query: poQuery, params: params }).asMappedResults();
        poResults.forEach((po, index) => {
            poSublist.setSublistValue({ id: 'vendor', line: index, value: po.entityid });
            poSublist.setSublistValue({ id: 'po_number', line: index, value: po.tranid });
            poSublist.setSublistValue({ id: 'date', line: index, value: po.trandate });
            poSublist.setSublistValue({ id: 'amount', line: index, value: po.total });
            poSublist.setSublistValue({ id: 'status', line: index, value: po.status });
        });

        context.response.writePage(form);
    }
    return { onRequest: onRequest };
 });
