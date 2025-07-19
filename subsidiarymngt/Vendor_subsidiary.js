/**
* @NApiVersion 2.1
* @NScriptType Suitelet
**/

/**
* Created by Hemanth Anil
* To retrieve all vendors with subsidiaries assigned to them.
**/

define(['N/query', 'N/log'], function(query, log) {
    function onRequest(context) {
        try {
            const sql = `
                SELECT
                    vendor.id AS vendor_id,
                    vendor.entityid AS vendor_name,
                    subsidiary.id AS subsidiary_id,
                    subsidiary.name AS subsidiary_name
                FROM
                    vendor
                JOIN
                    subsidiary ON vendor.subsidiary = subsidiary.id
                WHERE
                    vendor.subsidiary IS NOT NULL
            `;

            const results = query.runSuiteQL({ query: sql }).asMappedResults();

            log.debug('Vendors with Subsidiaries', results);

            context.response.write({
                output: JSON.stringify({
                    success: true,
                    data: results
                })
            });
        } catch (e) {
            log.error('Error fetching vendors with subsidiaries', e.message);
            context.response.write({
                output: JSON.stringify({
                    success: false,
                    message: e.message
                })
            });
        }
    }

    return {
        onRequest: onRequest
    };
});
