@echo off
set directory=C:\Program Files\Docker\Docker
set executable=Docker Desktop.exe

tasklist /FI "IMAGENAME eq %executable%" | find "%executable%" > nul
if %errorlevel% EQU 0 (goto checkdaemon)

echo Starting Docker Desktop...
start "" /D "%directory%" "Docker Desktop.exe"
@ping -n 10 localhost > nul

:checkdaemon
@docker ps > nul
if %errorlevel% NEQ 0 (
    echo Waiting for Docker Desktop to get ready...
    goto _checkdaemon
) else (goto startcontainer)
:_checkdaemon
@ping -n 5 localhost > nul
@docker ps > nul
if %errorlevel% NEQ 0 (goto _checkdaemon)

:startcontainer
echo Starting dynamodb container...
@docker start dynamodb > nul
if %errorlevel% NEQ 0 (goto createcontainer) else (goto createtable)

:createcontainer
echo Creating dynamodb container...
@docker network create product-purchaser > nul
@docker run --network product-purchaser --name dynamodb -d -p 8000:8000 amazon/dynamodb-local > nul

:createtable
echo Creating dynamodb table...
@aws dynamodb create-table --table-name UsersTable --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 --endpoint-url http://localhost:8000 > nul