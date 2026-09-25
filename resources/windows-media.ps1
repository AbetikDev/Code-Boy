$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
    $taskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    $operation = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $task = $taskMethod.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]).Invoke($null, @($operation))
    if (-not $task.Wait(4000)) { exit 2 }
    $playing = $false
    foreach ($session in $task.Result.GetSessions()) {
        if ($session.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing') { $playing = $true; break }
    }
    if ($playing) { [Console]::Write('true') } else { [Console]::Write('false') }
} catch { exit 1 }
