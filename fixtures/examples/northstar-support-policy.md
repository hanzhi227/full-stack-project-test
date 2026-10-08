# Northstar customer support policy

Document ID: SUP-204  
Version: 2.1  
Effective date: February 1, 2026  
Owner: Customer Support  
Approved by: Head of Customer Support  
Classification: Customer-facing  
Next review: August 1, 2026

## 1. Scope and support channels

Northstar Atlas is a hosted project-management service. This policy describes support availability, ticket severity, first-response targets, incident communications, and service-credit eligibility for Starter, Team, and Enterprise customers.

Customers can contact support at support@northstar.example or submit a ticket through the Atlas help menu. Both channels create a support record. Keep the ticket number for follow-up and reply in the existing thread when adding information about the same issue.

This policy does not set a resolution deadline or guarantee that a feature request will be implemented. A signed customer agreement may contain additional terms; support will refer account-specific contractual questions to the account owner. Do not assume that an operational response target is a contractual service-level guarantee.

## 2. Support hours and plan coverage

Standard support hours are Monday through Friday, 9:00 a.m. to 5:00 p.m. Eastern Time, excluding company holidays. Eastern Time follows the applicable seasonal offset. This document does not list the company holiday calendar; ask support to confirm coverage for a particular holiday date.

Enterprise customers also have access to a 24-hour emergency channel for Severity 1 incidents. The emergency channel is not available on the Starter or Team plan. Enterprise workspace administrators can find the emergency-channel instructions in their account support information. Use that channel for an active incident meeting the Severity 1 definition, not for routine questions.

| Plan | Routine support | Severity 1 coverage |
| --- | --- | --- |
| Starter | Standard support hours | Four support hours for first response. |
| Team | Standard support hours | Four support hours for first response. |
| Enterprise | Standard support hours | Emergency channel available 24 hours; one clock hour for first response. |

Support hours count only during standard support hours. Clock hours run continuously, including outside standard support hours. A business day is a day on which standard support operates. First-response timing starts when the request reaches the appropriate support channel; support may need to confirm plan and impact during triage.

## 3. Severity levels and first-response targets

A first-response target measures how quickly support acknowledges a ticket and begins investigating. It is not a promise that the issue will be resolved within that time. An automated receipt confirms delivery but does not mean that investigation has begun.

| Severity | Definition | First-response target |
| --- | --- | --- |
| Severity 1 | The production service is unavailable to all users in a customer workspace, with no workaround. | Enterprise: one clock hour, including nights and weekends. Starter and Team: four support hours. |
| Severity 2 | A major feature is unavailable, but the service remains usable or a workaround exists. | Four support hours on all plans. |
| Severity 3 | A minor defect, a how-to question, or a feature request. | Two business days on all plans. |

A problem affecting only one user is normally Severity 2 or Severity 3, not Severity 1. Support may revise the severity after reviewing the impact. Describe the affected workflow and available alternatives rather than choosing a severity solely because the issue is urgent for an individual user.

If the scope changes during investigation, reply with the new impact and when it began. Support will record the revised severity and explain any resulting change to the response process. Customer deadlines help establish context but do not by themselves change the technical severity definition.

### Timing examples

Assuming there is no company holiday, a Team Severity 2 ticket received on Friday at 4:00 p.m. Eastern Time uses one support hour before Friday's support window closes. The remaining three support hours run from 9:00 a.m. to noon on Monday. The four-support-hour first-response target is therefore noon on Monday.

An Enterprise Severity 1 report received through the emergency channel on Saturday at 11:20 p.m. Eastern Time has a first-response target of Sunday at 12:20 a.m. Clock-hour timing continues overnight and on weekends.

These examples illustrate the response clock. They do not predict restoration time, credit eligibility, or the severity of a different issue.

## 4. Opening a useful ticket

Include your workspace ID, the affected feature, the time the problem began with its time zone, and steps to reproduce the issue. If possible, attach a screenshot with personal information removed. A short, specific report reduces the need for follow-up questions.

Provide the following details when they are available:

- Workspace ID and the name of the affected feature.
- Whether all users, a group, or one user is affected.
- The first observed failure time and time zone.
- Expected behavior and the actual result.
- Reproduction steps and any visible error message.
- Browser or client version, if the issue appears client-specific.
- A workaround that has been tried and its result.
- An existing ticket or incident number if the issue may be related.

Do not include passwords, authentication codes, payment-card details, or API secrets. Support will never ask you to send those values in a ticket. Remove confidential content from screenshots and logs before sending them. Share only the portion of a log needed to show the failure and use the upload method provided by support.

### Ticket format

Subject: Atlas project view fails to load in workspace WS-1842

Workspace: WS-1842  
First observed: February 12, 2026, 10:15 a.m. Eastern Time  
Impact: Six users cannot open the project view; task lists remain available.  
Expected result: Selecting the project opens its overview.  
Actual result: The view displays an error after loading.  
Steps: Open the workspace, select Projects, then open the affected project.  
Workaround: Users can continue updating tasks from the task list.  
Attachments: Redacted screenshot and error timestamp.

This report would ordinarily be evaluated as Severity 2 because a major feature is affected and a workaround exists. Support confirms the classification after reviewing the evidence.

## 5. Triage and investigation

Support checks the reported workspace, plan, impact, and severity. The first response should identify the ticket owner and either describe the initial investigation or request the information needed to proceed. If a known incident already covers the issue, support links the ticket to that incident to avoid conflicting updates.

During investigation, support may ask an authorized workspace administrator to confirm settings or perform a limited diagnostic step. Support does not need your password or authentication code. If a proposed action could alter customer data or interrupt work, support should explain the action and obtain the necessary authorization before proceeding.

Keep a record of any changes made during troubleshooting. Include the time and result when replying to the ticket. Avoid making several unrelated configuration changes at once; that can make it harder to determine which change affected the outcome.

Feature requests are recorded for product review. A support acknowledgment or ticket closure does not commit Northstar to a delivery date. Support will distinguish a reported defect from a requested change in behavior when summarizing the request.

## 6. Escalation and incident communications

Reply to the existing ticket if the impact increases or the first-response target has passed. Do not open a duplicate ticket for the same issue. Include the current impact, the time it changed, and any information that was unavailable in the original report.

An Enterprise customer with a new or worsening Severity 1 incident should also use the emergency channel and reference the existing ticket number. This allows the incident team to find the earlier investigation without creating separate accounts of the same event.

For an ongoing Severity 1 incident, the incident owner posts an update every 60 minutes until service is restored. Updates should state the observed impact, what is known, the current action, and when the next update will be posted. The owner should avoid stating a restoration estimate that has not been confirmed.

A written incident summary is shared within five business days after restoration. The summary describes the impact window, the cause where established, the restoration work, and follow-up actions. If part of the investigation remains open, the summary should identify that uncertainty rather than presenting a suspected cause as confirmed.

## 7. Restoration and ticket closure

When service is restored, support asks the customer to verify the affected workflow where practical. Restoration of an incident does not necessarily mean that every related defect or follow-up action has been completed. The ticket record should identify any remaining work and its owner.

If the same failure returns, reply with the recurrence time and impact. Include whether the previously suggested workaround still works. Support will determine whether the recurrence belongs to the existing incident or requires a separate investigation.

Ticket closure is an administrative record of the support outcome. It does not change the deadline for a service-credit request, which is measured from the end of the eligible outage.

## 8. Service credits

### Eligibility

Only Enterprise customers are eligible for service credits under this policy. An eligible outage must last at least 60 consecutive minutes and make the production service unavailable to all users in the workspace. Several shorter interruptions do not meet the consecutive-duration requirement merely because their combined duration exceeds 60 minutes.

Scheduled maintenance announced at least 48 hours in advance does not qualify. Problems caused by a customer's network, devices, or configuration also do not qualify. A Severity 1 classification starts the emergency response process but does not automatically approve a credit; support reviews the duration, impact, and exclusions separately.

### Request and calculation

Request a credit within 14 calendar days after the outage ends. Include the workspace ID and the related incident number. Submit the request in the existing support thread so the account and incident records can be reviewed together.

Approved credits equal 10% of the monthly subscription fee and are capped at 20% of that fee per calendar month. Credits apply to a future invoice and are not cash refunds. Unused monthly capacity does not increase the cap for a later month.

| Review item | Requirement |
| --- | --- |
| Plan | Enterprise. |
| Duration | At least 60 consecutive minutes. |
| Impact | Production service unavailable to all users in the workspace. |
| Request deadline | Within 14 calendar days after the outage ends. |
| Required references | Workspace ID and incident number. |
| Credit per approved event | 10% of the monthly subscription fee. |
| Monthly cap | 20% of the monthly subscription fee. |
| Method | Credit on a future invoice; no cash refund. |

Support records the eligibility decision and the credit calculation in the ticket. If the request is declined, the response should identify the unmet requirement or applicable exclusion. Credit processing does not replace the incident summary or the underlying restoration work.

## 9. Worked incident record

An Enterprise workspace experiences a 90-minute production outage affecting every user, with no workaround. Support must first respond within one clock hour and provide updates every 60 minutes while the incident remains active. The incident summary is shared within five business days after restoration.

The customer may request a service credit within 14 calendar days after the outage ends. For a monthly subscription fee of $500, a single approved credit is $50, and total credits for that calendar month cannot exceed $100. Two approved events would reach the monthly cap. A third approved event in the same calendar month would not increase the total above $100.

If the same 90-minute interruption were caused by the customer's network, it would not qualify under this policy. If scheduled maintenance had been announced at least 48 hours in advance, that maintenance window would also be excluded.

## 10. Revision record

| Version | Effective date | Change |
| --- | --- | --- |
| 2.1 | February 1, 2026 | Clarified response-clock examples, escalation records, and service-credit review requirements. |

Customer Support owns this policy. Include SUP-204 and the relevant section number when asking for clarification. Account-specific commitments should be reviewed against the signed customer agreement.
