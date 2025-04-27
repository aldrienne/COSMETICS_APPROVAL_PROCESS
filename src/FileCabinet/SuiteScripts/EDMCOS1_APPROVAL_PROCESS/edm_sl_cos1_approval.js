/**
* @NApiVersion 2.1
* @NScriptType Suitelet
*/
define(['N/record', 'N/runtime', 'N/redirect', 'N/query'],
    (record, runtime, redirect, query) => {

        const APPROVAL_TYPE_MAPPING = {
            1: 'Any',
            2: 'All',
            3: 'Sequential'
        }
        
        const onRequest = (context) => {
            try {
                const request = context.request;
                const action = request.parameters.action;
                const recType = request.parameters.rectype;
                const recId = request.parameters.recid;
                const currentUser = runtime.getCurrentUser().id;
 
                const rec = record.load({
                    type: recType,
                    id: recId,
                    isDynamic: false
                });
 
                if (action === 'approve') {
                    const currentApprovers = rec.getValue('custbody_edmcos01_approver') || [];
                    currentApprovers.push(currentUser);
                    rec.setValue({
                        fieldId: 'custbody_edmcos01_approver',
                        value: currentApprovers
                    });
                    
                    checkApprovalThreshold(rec);
                    
                } else if (action === 'reject') {
                    const lineCount = rec.getLineCount({
                        sublistId: 'item'
                    });
                    
                    for (let i = 0; i < lineCount; i++) {
                        rec.setSublistValue({
                            sublistId: 'item',
                            fieldId: 'isclosed',
                            line: i,
                            value: true
                        });
                    }
                    
                    rec.setValue({
                        fieldId: 'custbody_edmcos01_rejection_reason',
                        value: `Rejected by ${runtime.getCurrentUser().name}`
                    });
                }
 
                log.debug('orderstatus', rec.getValue('orderstatus'));
                rec.save();
 
                redirect.toRecord({
                    type: recType,
                    id: recId
                });
 
            } catch (e) {
                log.error('Error in approval suitelet', e);
            }
        };
 
        const checkApprovalThreshold = (record) => {
            const appliedRuleId = record.getValue('custbody_edmcos01_applied_rule');
            
            const sqlText = `
                SELECT 
                    applevel.custrecord_al_approval_type AS level_approval_type,
                    applevel.custrecord_al_min_approvals AS level_min_approvals
                FROM customrecord_edm_cos01_approval_rule rule
                LEFT JOIN customrecord_edm_cos01_approval_level applevel 
                    ON applevel.custrecord_al_parent_rule = rule.id
                WHERE rule.id = ?
            `;
            
            const results = query.runSuiteQL({
                query: sqlText,
                params: [appliedRuleId]
            }).asMappedResults();
            
            if (!results || results.length === 0) {
                log.error('Rule not found', `Rule ID: ${appliedRuleId}`);
                return;
            }
            
            const approvalTypeId = results[0].level_approval_type;
            const minApprovals = results[0].level_min_approvals;
            const approvalType = APPROVAL_TYPE_MAPPING[approvalTypeId];
            
            const currentApprovers = record.getValue('custbody_edmcos01_approver') || [];
            const requiredApprovers = record.getValue('custbody_edmcos01_req_approver') || [];
        
            log.debug('Approval Type', approvalType);
            
            if (approvalType === 'All') {
                if (currentApprovers.length === requiredApprovers.length) {
                    updateOrderStatus(record, 'B'); // Approved
                }
            } else if (approvalType === 'Any') {
                if (currentApprovers.length >= minApprovals) {
                    updateOrderStatus(record, 'B'); // Approved
                }
            }
        };
 
        const updateOrderStatus = (record, status) => {
            if (status === 'B') { // Approved
                record.setValue({
                    fieldId: 'orderstatus',
                    value: status
                });
                
                // Set approval date
                record.setValue({
                    fieldId: 'custbody_edmcos01_approval_date',
                    value: new Date()
                });
            }
         };
 
        return { onRequest };
    });