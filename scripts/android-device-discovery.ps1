function Resolve-OneLeadQAndroidDevice {
    param([scriptblock]$RunAdb, [string]$RequestedDevice)
    function Read-AuthorizedDevices {
        @(& $RunAdb -Arguments @('devices') | ForEach-Object {
            if ($_ -match '^([^\s]+)\s+device\s*$') { $Matches[1] }
        } | Select-Object -Unique)
    }
    $connected = @(Read-AuthorizedDevices)
    if (!$connected.Count -or ($RequestedDevice -and $RequestedDevice -notin $connected)) {
        # mDNS advertises the current connection port; pairing ports are not connect ports.
        $services = @(& $RunAdb -Arguments @('mdns', 'services'))
        $endpoints = @($services | ForEach-Object {
            if ($_ -match '_adb-tls-connect\._tcp\.?\s+(\S+:\d+)\s*$') { $Matches[1] }
        } | Select-Object -Unique)
        foreach ($endpoint in $endpoints) { & $RunAdb -Arguments @('connect', $endpoint) | Out-Null }
        $connected = @(Read-AuthorizedDevices)
    }
    if ($RequestedDevice) {
        if ($RequestedDevice -notin $connected) { throw 'Requested Android device is not authorized or connected' }
        return $RequestedDevice
    }
    if ($connected.Count -eq 1) { return $connected[0] }
    if (!$connected.Count) { throw 'No authorized Android device connected; no usable wireless mDNS connection discovered. Unlock the phone and enable Wireless debugging on the same Wi-Fi.' }
    throw 'Multiple authorized Android transports detected; specify -Device to avoid testing the wrong phone'
}
