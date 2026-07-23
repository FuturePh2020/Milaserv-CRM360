using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Milaserv.ActivityAgent;

/// <summary>
/// Talks to the Milaserv CRM360 API. Sends only the fields the specification
/// allows: device id, last activity timestamp, idle duration, and companion
/// version. Never key contents, screenshots, or window/file titles.
/// </summary>
public class HeartbeatClient
{
    private readonly HttpClient _httpClient;
    private string? _deviceToken;

    public HeartbeatClient(string apiBaseUrl)
    {
        _httpClient = new HttpClient { BaseAddress = new Uri(apiBaseUrl) };
    }

    public async Task RegisterDeviceAsync(string deviceId, string deviceName, string accessToken, CancellationToken ct)
    {
        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await _httpClient.PostAsJsonAsync(
            "/devices/register",
            new DeviceRegistrationRequest(deviceId, deviceName),
            ct
        );
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<DeviceRegistrationResponse>(cancellationToken: ct);
        _deviceToken = body?.DeviceToken;
    }

    public async Task SendHeartbeatAsync(HeartbeatRequest request, CancellationToken ct)
    {
        if (_deviceToken is null)
        {
            throw new InvalidOperationException("Device is not registered. Call RegisterDeviceAsync first.");
        }

        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Device", _deviceToken);
        var response = await _httpClient.PostAsJsonAsync("/devices/heartbeat", request, ct);
        response.EnsureSuccessStatusCode();
    }
}
