Problem Statement
Manual bank account entry for vendors and employees into NetSuite was time-consuming, error-prone, and lacked real-time validation. Payment-related data was entered from an external website manually, resulting in:

- Frequent entry errors
- Sync issues with payment runs
- Compliance and audit risks

Goal: lower error rate and cut latency to ≤ 15 min without expanding human headcount.

[Website Table updates]
          |
          v
[Snowflake Daily Sync]  ← (data warehouse)
          |
          v
[Databricks Python Job]  ← (ETL logic & orchestration) 
          |
  Triggers REST API calls (insert/update)
          |
          v
[NetSuite SuiteScript RESTlets]
          |
  Updates Vendor/Employee Records
