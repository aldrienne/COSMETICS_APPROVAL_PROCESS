/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/url'], (url) => {

    function pageInit(scriptContext) {
    }
    function handleApprove() {
        const suiteletURL = url.resolveScript({
            scriptId: 'customscript_edm_sl_cos1_approval',
            deploymentId: 'customdeploy1',
            returnExternalUrl: false,
            params: {
                action: 'approve',
                rectype: nlapiGetRecordType(),
                recid: nlapiGetRecordId()
            }
        });
        window.location = suiteletURL;
    }

    function handleReject() {
        const suiteletURL = url.resolveScript({
            scriptId: 'customscript_edm_sl_cos1_approval',
            deploymentId: 'customdeploy1',
            returnExternalUrl: false,
            params: {
                action: 'reject',
                rectype: nlapiGetRecordType(),
                recid: nlapiGetRecordId()
            }
        });
        window.location = suiteletURL;
    }

    return {
        pageInit,
        handleApprove,
        handleReject
    };
});