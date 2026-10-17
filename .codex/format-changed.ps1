$ErrorActionPreference = 'Stop'

try {
    $formatter = Join-Path (Split-Path $PSScriptRoot -Parent) 'frontend/scripts/format-changed.mts'
    $hookInput = [Console]::In.ReadToEnd()
    $hookInput | & node $formatter --hook
    exit $LASTEXITCODE
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
