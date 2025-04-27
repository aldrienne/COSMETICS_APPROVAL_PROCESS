/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/search', 'N/query', 'N/runtime', 'N/record'],
    /**
 * @param{search} search
 */
    (search, query, runtime, record) => {
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
            //On create
            if (scriptContext.type === scriptContext.UserEventType.CREATE) {
                const newRecord = scriptContext.newRecord;
                const oldRecord = scriptContext.oldRecord;

                let nType = newRecord.getValue({
                    fieldId: 'ntype'
                });

                log.debug('nType', nType);

                //Execute query here

                let approvalRules = queryActiveApprovalRule(nType);
                log.debug('approvalRules', approvalRules);

                let structuredRules = buildRuleStructure(approvalRules);
                log.debug('structuredRules', structuredRules);

                let transactionContext = buildTransactionContext(newRecord, structuredRules);
                log.debug('transactionContext', transactionContext);

                let matchingRule = findMatchingRule(structuredRules, transactionContext);
                log.debug('matchingRule', matchingRule);

                if (matchingRule) {
                    // Get threshold value using dynamic field
                    const thresholdValue = matchingRule.thresholdField ?
                        newRecord.getValue(matchingRule.thresholdField) : 0;

                    let matchingLevel = findMatchingLevel(matchingRule, thresholdValue);
                    log.debug('matchingLevel', matchingLevel);

                    if (matchingLevel) {
                        let approvers = getApproversForLevel(matchingLevel);
                        log.debug('approvers', approvers);

                        // Next: Update record status and set approvers
                        updateRecordForApproval(
                            newRecord.type,
                            newRecord.id,
                            approvers,
                            matchingRule,
                            matchingLevel
                        );
                    }
                }

                //Get current execution usage
                log.audit('Current Usage', runtime.getCurrentScript().getRemainingUsage());



            }

        }

        const queryActiveApprovalRule = (nType) => {
            const sqlText = `
                SELECT 
                    -- Approval Rule fields
                    rule.id AS rule_id,
                    rule.name AS rule_name,
                    rule.custrecord_ar_approval_type AS rule_approval_type,
                    rule.custrecord_ar_priority AS rule_priority,
                    rule.custrecord_ar_is_default AS is_default_rule,
                    rule.custrecord_ar_threshold_field AS rule_threshold_field,
                    
                    -- Rule Condition fields  
                    condition.id AS condition_id,
                    condition.custrecord_rc_field_id AS condition_field_id,
                    condition.custrecord_rc_operator AS condition_operator,
                    condition.custrecord_rc_value AS condition_value,
                    
                    -- Approval Level fields
                    applevel.id AS level_id,
                    applevel.custrecord_al_min_amount AS level_min_amount,
                    applevel.custrecord_al_max_amount AS level_max_amount,
                    applevel.custrecord_al_min_approvals AS level_min_approvals,
                    applevel.custrecord_al_approval_type AS level_approval_type,
                    
                    -- Approval Assignee fields
                    assignee.id AS assignee_id,
                    assignee.custrecord_aa_user AS approver_id,
                    assignee.custrecord_aa_sequence AS approver_sequence,
                    assignee.custrecord_aa_is_required AS approver_is_required
        
                FROM customrecord_edm_cos01_approval_rule rule
                    LEFT JOIN customrecord_edm_cos01_rule_condition condition 
                        ON condition.custrecord_rc_parent_rule = rule.id
                    LEFT JOIN customrecord_edm_cos01_approval_level applevel 
                        ON applevel.custrecord_al_parent_rule = rule.id
                    LEFT JOIN customrecord_edm_cos01_approval_assignee assignee 
                        ON assignee.custrecord_aa_parent_level = applevel.id
                        
                WHERE rule.isinactive = 'F'
                    AND (rule.custrecord_ar_approval_type = ? OR rule.custrecord_ar_approval_type IS NULL)
                    
                ORDER BY 
                    rule.custrecord_ar_priority DESC NULLS LAST,
                    rule.id,
                    applevel.custrecord_al_min_amount,
                    assignee.custrecord_aa_sequence
            `;

            return query.runSuiteQL({
                query: sqlText,
                params: [nType]
            }).asMappedResults();
        };

        const buildRuleStructure = (queryResults) => {
            const rules = {};

            queryResults.forEach(row => {
                if (!rules[row.rule_id]) {
                    rules[row.rule_id] = {
                        id: row.rule_id,
                        name: row.rule_name,
                        approvalType: row.rule_approval_type,
                        priority: row.rule_priority,
                        isDefault: row.is_default_rule,
                        thresholdField: row.rule_threshold_field,
                        conditions: {},
                        levels: {},
                        requiredFields: new Set()
                    };
                }
                // Add threshold field to required fields if present
                if (row.rule_threshold_field) {
                    rules[row.rule_id].requiredFields.add(row.rule_threshold_field);
                }

                // Add condition if present
                if (row.condition_id) {
                    rules[row.rule_id].conditions[row.condition_id] = {
                        id: row.condition_id,
                        fieldId: row.condition_field_id,
                        operator: row.condition_operator,
                        value: row.condition_value
                    };
                    rules[row.rule_id].requiredFields.add(row.condition_field_id);
                }

                // Add level if present
                if (row.level_id) {
                    if (!rules[row.rule_id].levels[row.level_id]) {
                        rules[row.rule_id].levels[row.level_id] = {
                            id: row.level_id,
                            minAmount: row.level_min_amount,
                            maxAmount: row.level_max_amount,
                            minApprovals: row.level_min_approvals,
                            approvalType: row.level_approval_type,
                            approvers: []
                        };
                    }
                    // Add approver if present
                    if (row.assignee_id) {
                        // Check for duplicates before pushing
                        const existingApprover = rules[row.rule_id].levels[row.level_id].approvers
                            .find(a => a.approverId === row.approver_id);

                        if (!existingApprover) {
                            rules[row.rule_id].levels[row.level_id].approvers.push({
                                id: row.assignee_id,
                                approverId: row.approver_id,
                                sequence: row.approver_sequence,
                                isRequired: row.approver_is_required
                            });
                        }
                    }
                }
            });

            // Convert requiredFields Set to Array
            Object.values(rules).forEach(rule => {
                rule.requiredFields = Array.from(rule.requiredFields);
            });

            return Object.values(rules);
        };

        const buildTransactionContext = (record, rules) => {
            const context = {};
            const allRequiredFields = new Set();

            // Collect all required fields from all rules
            rules.forEach(rule => {
                rule.requiredFields.forEach(field => allRequiredFields.add(field));
            });

            // Get values for all required fields
            allRequiredFields.forEach(fieldId => {
                try {
                    context[fieldId] = record.getValue({ fieldId: fieldId });
                } catch (e) {
                    log.error('Field not found', `Unable to get value for field: ${fieldId}`);
                    context[fieldId] = null;
                }
            });

            return context;
        };
        const evaluateRule = (rule, context) => {
            // If no conditions, rule matches by default
            if (Object.keys(rule.conditions).length === 0) {
                return true;
            }

            // Check all conditions
            for (const condition of Object.values(rule.conditions)) {
                const recordValue = context[condition.fieldId];
                const conditionValue = condition.value;

                switch (condition.operator.toLowerCase()) {
                    case 'equalto':
                    case 'is':
                        if (recordValue != conditionValue) return false;
                        break;
                    case 'anyof':
                        const values = conditionValue.split(',').map(v => v.trim());
                        if (!values.includes(String(recordValue))) return false;
                        break;
                    case 'greaterthan':
                        if (parseFloat(recordValue) <= parseFloat(conditionValue)) return false;
                        break;
                    case 'lessthan':
                        if (parseFloat(recordValue) >= parseFloat(conditionValue)) return false;
                        break;
                    // Add more operators as needed
                    default:
                        log.error('Unknown operator', `Operator ${condition.operator} not supported`);
                        return false;
                }
            }

            return true;
        };

        const findMatchingRule = (rules, context) => {
            // Rules are already sorted by priority in the query
            for (const rule of rules) {
                if (evaluateRule(rule, context)) {
                    return rule;
                }
            }

            // Return default rule if no match
            return rules.find(r => r.isDefault === 'T');
        };

        const findMatchingLevel = (rule, thresholdValue) => {
            if (!rule || !rule.levels) return null;

            return Object.values(rule.levels).find(level => {
                const minAmount = parseFloat(level.minAmount) || 0;
                const maxAmount = level.maxAmount ? parseFloat(level.maxAmount) : Infinity;
                return thresholdValue >= minAmount && thresholdValue <= maxAmount;
            });
        };

        const getApproversForLevel = (level) => {
            if (!level || !level.approvers) return [];

            return level.approvers.sort((a, b) => a.sequence - b.sequence);
        };

        const updateRecordForApproval = (recordType, recordId, approvers, rule, level) => {
            const recObj = record.load({
                type: recordType,
                id: recordId,
                isDynamic: false
            });

            // Set status to Pending Approval
            recObj.setValue({
                fieldId: 'orderstatus',
                value: 'A' // Assuming 1 = Pending Approval
            });

            // Set applied rule
            recObj.setValue({
                fieldId: 'custbody_edmcos01_applied_rule',
                value: rule.id
            });
            const approverIds = approvers.map(a => a.approverId);
            recObj.setValue({
                fieldId: 'custbody_edmcos01_req_approver',
                value: approverIds
            });

            // Set required approvers (JSON format for multiselect/text field)
            // record.setValue({
            //     fieldId: 'custbody_edmcos01_req_approver',
            //     value: JSON.stringify({
            //         approvers: approvers,
            //         level: level,
            //         approvalType: level.approvalType,
            //         minApprovals: level.minApprovals
            //     })
            // });

            recObj.save();
        };



        return { beforeLoad, beforeSubmit, afterSubmit }

    });
