# Parable Proof: export Microsoft 365 delegated app permissions as an evidence CSV.
#
# Reads only. Needs the Microsoft.Graph.Authentication module and an account that can
# consent to: Application.Read.All, DelegatedPermissionGrant.Read.All, User.Read.All.
#
# Output columns match docs/v0-user-journey.md Screen 3:
#   user_email, app_name, app_id, permission_scope, consent_type, resource_name,
#   observed_at, user_department, service_principal_id
#
# One row per permission. A grant with several scopes becomes several rows.
# observed_at is the time of this export: Microsoft does not record when a grant was made.
#
# Not included in V0: application permissions (app role assignments).
#
# Usage:
#   .\scripts\export-evidence.ps1 -TenantId contoso.onmicrosoft.com -OutFile "$env:USERPROFILE\Downloads\evidence.csv"
# Sign-in uses a device code: open https://login.microsoft.com/device in a private window and enter the code shown.

param(
    [Parameter(Mandatory = $true)][string]$TenantId,
    [string]$OutFile = "evidence-export.csv"
)

$ErrorActionPreference = "Stop"

Connect-MgGraph -TenantId $TenantId -Scopes "Application.Read.All", "DelegatedPermissionGrant.Read.All", "User.Read.All" -NoWelcome -UseDeviceCode

function Get-AllPages([string]$Uri) {
    $items = @()
    while ($Uri) {
        $page = Invoke-MgGraphRequest -Method GET -Uri $Uri
        $items += $page.value
        $Uri = $page.'@odata.nextLink'
    }
    return $items
}

$spCache = @{}
function Get-ServicePrincipal([string]$Id) {
    if (-not $spCache.ContainsKey($Id)) {
        $spCache[$Id] = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$($Id)?`$select=id,appId,displayName"
    }
    return $spCache[$Id]
}

$userCache = @{}
function Get-GraphUser([string]$Id) {
    if (-not $userCache.ContainsKey($Id)) {
        $userCache[$Id] = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/users/$($Id)?`$select=userPrincipalName,department"
    }
    return $userCache[$Id]
}

$observedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$grants = Get-AllPages "https://graph.microsoft.com/v1.0/oauth2PermissionGrants"

$rows = foreach ($grant in $grants) {
    $client = Get-ServicePrincipal $grant.clientId
    $resource = Get-ServicePrincipal $grant.resourceId

    $email = ""
    $department = ""
    if ($grant.consentType -eq "Principal" -and $grant.principalId) {
        $user = Get-GraphUser $grant.principalId
        $email = "$($user.userPrincipalName)".ToLower()
        $department = "$($user.department)"
    }

    $scopes = "$($grant.scope)".Trim() -split "\s+" | Where-Object { $_ }
    foreach ($scope in $scopes) {
        [pscustomobject]@{
            user_email           = $email
            app_name             = $client.displayName
            app_id               = $client.appId
            permission_scope     = $scope
            consent_type         = $grant.consentType
            resource_name        = $resource.displayName
            observed_at          = $observedAt
            user_department      = $department
            service_principal_id = $client.id
        }
    }
}

$rows | Export-Csv -Path $OutFile -NoTypeInformation -Encoding UTF8

Write-Host "Exported $(@($rows).Count) permission rows from $(@($grants).Count) grants to $OutFile"
Disconnect-MgGraph | Out-Null