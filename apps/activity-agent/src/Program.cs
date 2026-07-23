using Milaserv.ActivityAgent;

const string CompanionVersion = "0.1.0";
const int HeartbeatIntervalSeconds = 30;

var apiBaseUrl = Environment.GetEnvironmentVariable("MILASERV_API_URL") ?? "http://localhost:4000";
var deviceId = Environment.GetEnvironmentVariable("MILASERV_DEVICE_ID") ?? Environment.MachineName;
var accessToken = Environment.GetEnvironmentVariable("MILASERV_ACCESS_TOKEN");

if (string.IsNullOrWhiteSpace(accessToken))
{
    Console.Error.WriteLine("MILASERV_ACCESS_TOKEN is required for initial device registration.");
    Environment.Exit(1);
    return;
}

var client = new HeartbeatClient(apiBaseUrl);
using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
};

Console.WriteLine($"Milaserv Activity Agent v{CompanionVersion} starting for device {deviceId}...");
await client.RegisterDeviceAsync(deviceId, Environment.MachineName, accessToken, cts.Token);
Console.WriteLine("Device registered. Sending heartbeats every " + HeartbeatIntervalSeconds + "s.");

while (!cts.IsCancellationRequested)
{
    var lastActivity = NativeIdleDetector.GetLastInputTimestampUtc();
    var idleDuration = DateTimeOffset.UtcNow - lastActivity;

    try
    {
        await client.SendHeartbeatAsync(
            new HeartbeatRequest(deviceId, lastActivity, (int)idleDuration.TotalSeconds, CompanionVersion),
            cts.Token
        );
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Heartbeat failed: {ex.Message}");
    }

    try
    {
        await Task.Delay(TimeSpan.FromSeconds(HeartbeatIntervalSeconds), cts.Token);
    }
    catch (TaskCanceledException)
    {
        break;
    }
}
