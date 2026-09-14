---
name: financial-overview
description: Use the live CRM whenever the user asks for a financial overview, receivables, tax debts, income, expenses, cashflow, customers, leads, tasks, or upcoming events.
---

# CRM financial overview

Use the bundled read-only `crm` MCP server. Never infer live financial values from prior chat messages.

1. Call `getCashflow` first for a financial overview, receivables, tax debts, income, expenses, received money, paid-out money, open invoices, and forecast.
2. Call `getCrmData` only when record-level detail is needed:
   - `events` for upcoming events or event receivables.
   - `tasks` for incomplete tasks.
   - `leads` for leads that still need handling.
   - `customers` for customer details.
   - `all` only for a broad cross-CRM review.
3. Answer in Hebrew.
4. Format money in ₪ and state the data timestamp.
5. Clearly distinguish observed amounts from forecasts.
6. If the API reports missing expenses or default tax debts, disclose that limitation.
7. Do not create, update, or delete CRM data. The integration is read-only.
