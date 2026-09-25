$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime

    # Load WinRT types
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,
             Windows.Media.Control, ContentType = WindowsRuntime]

    # Find AsTask helper for IAsyncOperation<T>
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq 'AsTask' -and
            $_.IsGenericMethod -and
            $_.GetParameters().Count -eq 1 -and
            $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
        } | Select-Object -First 1

    $op      = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $generic = $asTask.MakeGenericMethod(
                   [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    $task    = $generic.Invoke($null, @($op))

    if (-not $task.Wait(5000)) {
        [Console]::Write('false')
        exit 0
    }

    $manager  = $task.Result
    $sessions = $manager.GetSessions()
    $playing  = $false

    foreach ($session in $sessions) {
        $info = $session.GetPlaybackInfo()
        # PlaybackStatus: Playing = 4
        if ($info -and $info.PlaybackStatus.ToString() -eq 'Playing') {
            $playing = $true
            break
        }
    }

    if ($playing) { [Console]::Write('true') } else { [Console]::Write('false') }
} catch {
    # Fallback: check if any known media process is running
    $mediaProcesses = @(
        'chrome','msedge','firefox','spotify','vlc','wmplayer',
        'groove','music.ui','Videos.UI','foobar2000','aimp','mpc-hc','mpc-be'
    )
    $found = $false
    foreach ($proc in $mediaProcesses) {
        if (Get-Process -Name $proc -ErrorAction SilentlyContinue) {
            # Process running but can't confirm playing — return false to avoid false positives
            $found = $true
            break
        }
    }
    # Return false on error — manual MUSIC button is always available
    [Console]::Write('false')
    exit 0
}
