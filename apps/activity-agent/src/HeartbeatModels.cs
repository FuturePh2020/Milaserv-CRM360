namespace Milaserv.ActivityAgent;

public record HeartbeatRequest(
    string DeviceId,
    DateTimeOffset LastActivityAt,
    int IdleDurationSeconds,
    string CompanionVersion
);

public record DeviceRegistrationRequest(string DeviceId, string DeviceName);

public record DeviceRegistrationResponse(string DeviceId, string DeviceToken);
