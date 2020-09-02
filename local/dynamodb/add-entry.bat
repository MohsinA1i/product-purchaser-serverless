cd /d %~dp0
aws dynamodb put-item --table-name UsersTable --item file://add-entry/entry.json --endpoint-url http://localhost:8000