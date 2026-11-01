---
paths: "terraform/**/*, **/*.tf"
---
# Infrastructure Conventions

Rule id: RULE-TERRAFORM-3303

- Use snake_case for all resource names.
- Tag every resource with environment and team labels.
- Never hardcode AMI IDs. Use data sources.
- State files must reference remote backends, never local.
