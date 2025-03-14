/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define(['N/query', 'N/record', 'N/log'], function(query, record, log) {

    function onRequest(context) {
        if (context.request.method === 'GET') {
            var entityId = context.request.parameters.entityId;
            var subsidiaryList = getSubsidiaryList(entityId);
            context.response.write(JSON.stringify(subsidiaryList));
        }
    }

    function getSubsidiaryList(entityId) {
        var queryStr = `
            SELECT 
                s.id 
            FROM
                subsidiary s
            WHERE
                s.iselimination = 'F'
                AND s.isinactive = 'F'
                AND NOT EXISTS 
                    (SELECT 1 FROM vendorsubsidiaryrelationship r WHERE r.entity = ? AND s.id = r.subsidiary)
        `;
        var results = executeQuery(queryStr, [entityId]);
        return results;
    }

    function executeQuery(queryStr, params) {
        var queryObj = query.create({
            query: queryStr
        });
        for (var i = 0; i < params.length; i++) {
            queryObj.bind(i + 1, params[i]);
        }
        var results = queryObj.run().asMappedResults();
        log.debug('Query Results', results);
        return results;
    }

    return {
        onRequest: onRequest
    };
});