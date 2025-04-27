/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/runtime', 'N/ui/serverWidget', 'N/url'],

    (runtime, serverWidget, url) => {
        const beforeLoad = (scriptContext) => {
            if (scriptContext.type !== scriptContext.UserEventType.VIEW) {
                return;
            }

            const record = scriptContext.newRecord;
            const form = scriptContext.form;
            const currentUser = runtime.getCurrentUser().id;

            const orderStatus = record.getValue('orderstatus');
            if (orderStatus !== 'A') {
                return;
            }
            // Remove native approve/process buttons if they exist
            removeButtons(form, ['approve']);

            const requiredApprovers = record.getValue('custbody_edmcos01_req_approver') || [];
            if (requiredApprovers.length === 0) {
                return;
            }

            const requiredApproversStr = requiredApprovers.map(id => String(id));
            const currentUserStr = String(currentUser);

            if (!requiredApproversStr.includes(currentUserStr)) {
                return;
            }

            const approvedUsers = record.getValue('custbody_edmcos01_approver') || [];
            const approvedUsersStr = approvedUsers.map(id => String(id));
            const hasUserApproved = approvedUsersStr.includes(currentUserStr);

            if (hasUserApproved) {
                log.debug('User has already approved', `User ID: ${currentUserStr}`);
                return;
            }

            form.clientScriptModulePath = './edm_cm_cos1_approval_buttons.js';

            form.addButton({
                id: 'custpage_approve',
                label: 'Approve',
                functionName: 'handleApprove'
            });

            form.addButton({
                id: 'custpage_reject',
                label: 'Reject',
                functionName: 'handleReject'
            });

            // Add client script to form

        }

        const removeButtons = (form, buttonIds) => {
            buttonIds.forEach(buttonId => {
                try {
                    form.removeButton(buttonId);
                } catch (e) {
                    log.debug('Remove Button', `Button with ID '${buttonId}' not found or already removed`);
                }
            });
        }

        return { beforeLoad }
    });