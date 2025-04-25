/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @description Validates customer credit limit against A/R balance plus current order
 * Script ID: customscript_edmcos01_credit_validation_ue
 */
define(['N/search', 'N/record', 'N/log'],

    (search, record, log) => {
        const FLD_TOTAL_EXPOSURE = "custbody_edmcos01_total_exposure";
        const FLD_AMOUNT_OVER_LIMIT = "custbody_edmcos01_exposure_over_limit";
        
        /**
         * Defines the function definition that is executed before record is loaded.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @param {Form} scriptContext.form - Current form
         * @param {ServletRequest} scriptContext.request - HTTP request information sent from the browser for a client action only.
         * @since 2015.2
         */
        const beforeLoad = (scriptContext) => {
            // Not used in this implementation
        }

        /**
         * Defines the function definition that is executed before record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const beforeSubmit = (scriptContext) => {
            try {
                const newRecord = scriptContext.newRecord;
                
                // Only process for Sales Orders in create and edit mode
                if (scriptContext.type !== scriptContext.UserEventType.CREATE && 
                    scriptContext.type !== scriptContext.UserEventType.EDIT) {
                    return;
                }
                
                // Only process if record type is Sales Order
                if (newRecord.type !== record.Type.SALES_ORDER) {
                    return;
                }
                
                const customerId = newRecord.getValue({ fieldId: 'entity' });
                
                // Skip processing if no customer is selected
                if (!customerId) {
                    return;
                }
                
                const creditLimit = retrieveCustomerCreditLimit(customerId);
                let customerARBalance = retrieveCustomerARBalance(customerId);
                const orderAmount = parseFloat(newRecord.getValue({ fieldId: 'total' }) || 0);
                
                // Handle edit mode - prevent double counting the current order
                if (scriptContext.type === scriptContext.UserEventType.EDIT && scriptContext.oldRecord) {
                    const oldOrderAmount = parseFloat(scriptContext.oldRecord.getValue({ fieldId: 'total' }) || 0);
                    // Subtract the old order amount from AR balance to avoid double counting
                    customerARBalance -= oldOrderAmount;
                    log.debug('Edit Mode', `Adjusted AR Balance by subtracting old order amount: ${oldOrderAmount}`);
                }
                
                const totalCustomerExposure = customerARBalance + orderAmount;
                const amountOverLimit = Math.max(0, totalCustomerExposure - creditLimit);
                
                newRecord.setValue({
                    fieldId: FLD_TOTAL_EXPOSURE,
                    value: totalCustomerExposure
                });
                
                newRecord.setValue({
                    fieldId: FLD_AMOUNT_OVER_LIMIT,
                    value: amountOverLimit
                });
            } catch (e) {
                log.error('Error in Credit Validation Script', e.toString());
                
                // Uncomment to prevent record submission if critical
                // throw e;
            }
        }

        /**
         * Defines the function definition that is executed after record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const afterSubmit = (scriptContext) => {
            // Not used in this implementation
        }

        /**
         * Get the customer credit limit from the customer record
         * @param {string} customerId - Internal ID of the customer
         * @returns {number} - Credit limit amount
         */
        const retrieveCustomerCreditLimit = (customerId) => {
            try {            
                const creditLimitFields = search.lookupFields({
                    type: search.Type.CUSTOMER,
                    id: customerId,
                    columns: ['creditlimit']
                });
                return parseFloat(creditLimitFields.creditlimit || 0);
            } catch (e) {
                log.error('Error retrieving customer credit limit', `CustomerId: ${customerId}, Error: ${e.toString()}`);
                return 0;
            }
        }

        /**
         * Get the customer A/R balance with unbilled orders
         * @param {string} customerId - Internal ID of the customer
         * @returns {number} - Total customer exposure
         */
        const retrieveCustomerARBalance = (customerId) => {
            try {
                // Code to get A/R balance with unbilled orders
                const customerFields = search.lookupFields({
                    type: search.Type.CUSTOMER,
                    id: customerId,
                    columns: ['balance', 'unbilledorders']
                });

                // Total exposure from existing A/R
                const arBalance = parseFloat(customerFields.balance || 0);
                const unbilledOrders = parseFloat(customerFields.unbilledorders || 0);
                return arBalance + unbilledOrders;
            } catch (e) {
                log.error('Error retrieving customer A/R balance', `CustomerId: ${customerId}, Error: ${e.toString()}`);
                return 0;
            }
        }

        return { beforeLoad, beforeSubmit, afterSubmit }
    });