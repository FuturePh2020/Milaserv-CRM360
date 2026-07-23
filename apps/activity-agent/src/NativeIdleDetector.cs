using System.Runtime.InteropServices;

namespace Milaserv.ActivityAgent;

/// <summary>
/// Reads device-wide last input time using the Win32 GetLastInputInfo API.
/// This reflects mouse/keyboard activity anywhere on the machine, not just this
/// process's window - which is exactly what a browser tab cannot see, and the
/// reason this companion exists instead of a purely web-based idle timer.
/// It never reads key contents, only the timestamp of the last input event.
/// </summary>
public static class NativeIdleDetector
{
    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    /// <summary>
    /// Returns the UTC timestamp of the last device-wide input event.
    /// </summary>
    public static DateTimeOffset GetLastInputTimestampUtc()
    {
        var info = new LASTINPUTINFO();
        info.cbSize = (uint)Marshal.SizeOf(info);

        if (!GetLastInputInfo(ref info))
        {
            // Fall back to "now" rather than reporting a false idle period.
            return DateTimeOffset.UtcNow;
        }

        // dwTime is tick count (ms since boot) of the last input; Environment.TickCount64
        // is the current tick count. The difference is the idle duration in milliseconds.
        var idleMilliseconds = (uint)Environment.TickCount - info.dwTime;
        return DateTimeOffset.UtcNow.AddMilliseconds(-idleMilliseconds);
    }

    public static TimeSpan GetIdleDuration()
    {
        return DateTimeOffset.UtcNow - GetLastInputTimestampUtc();
    }
}
