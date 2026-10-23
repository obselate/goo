using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Microsoft.Win32;

[SupportedOSPlatform("windows")]
internal sealed unsafe class InstalledIdentity : IDisposable
{
    private readonly string scheme;
    private readonly string shortcut;

    internal InstalledIdentity(string identifier, string scheme)
    {
        this.scheme = scheme;
        shortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), scheme + ".lnk");
        int initialized = CoInitializeEx(0, 0);
        if (initialized < 0 && initialized != unchecked((int)0x80010106)) Marshal.ThrowExceptionForHR(initialized);
        try
        {
            using (var protocol = Registry.CurrentUser.CreateSubKey(@"Software\Classes\" + scheme))
            {
                protocol.SetValue("URL Protocol", "");
                using var command = protocol.CreateSubKey(@"shell\open\command");
                command.SetValue("", $"\"{Environment.ProcessPath}\" --goo-notification \"%1\"");
            }
            var clsid = new Guid("00021401-0000-0000-c000-000000000046");
            var iid = new Guid("000214f9-0000-0000-c000-000000000046");
            Marshal.ThrowExceptionForHR(CoCreateInstance(in clsid, 0, 1, in iid, out nint link));
            try
            {
                fixed (char* path = Environment.ProcessPath)
                    Marshal.ThrowExceptionForHR(((delegate* unmanaged<nint, char*, int>)Method(link, 20))(link, path));
                iid = new("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99");
                Marshal.ThrowExceptionForHR(Marshal.QueryInterface(link, in iid, out nint store));
                try
                {
                    fixed (char* text = identifier) SetProperty(store, 5, 31, (nint)text);
                    var activator = Guid.NewGuid();
                    SetProperty(store, 26, 72, (nint)(&activator));
                    Marshal.ThrowExceptionForHR(((delegate* unmanaged<nint, int>)Method(store, 7))(store));
                }
                finally { Marshal.Release(store); }
                iid = new("0000010b-0000-0000-c000-000000000046");
                Marshal.ThrowExceptionForHR(Marshal.QueryInterface(link, in iid, out nint persist));
                try
                {
                    fixed (char* path = shortcut)
                        Marshal.ThrowExceptionForHR(((delegate* unmanaged<nint, char*, int, int>)Method(persist, 6))(persist, path, 1));
                }
                finally { Marshal.Release(persist); }
            }
            finally { Marshal.Release(link); }
        }
        catch
        {
            Dispose();
            throw;
        }
        finally { if (initialized >= 0) CoUninitialize(); }
    }

    public void Dispose()
    {
        File.Delete(shortcut);
        Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\" + scheme, false);
    }

    private static void SetProperty(nint store, uint id, ushort kind, nint data)
    {
        var key = new PropertyKey { Format = new("9f4c2855-9f79-4b39-a8d0-e1d42de1d5f3"), Id = id };
        var value = new PropertyValue { Kind = kind, Data = data };
        Marshal.ThrowExceptionForHR(((delegate* unmanaged<nint, PropertyKey*, PropertyValue*, int>)Method(store, 6))
            (store, &key, &value));
    }

    private static nint Method(nint value, int slot) => Marshal.ReadIntPtr(Marshal.ReadIntPtr(value), slot * IntPtr.Size);

    [StructLayout(LayoutKind.Sequential)]
    private struct PropertyKey { internal Guid Format; internal uint Id; }

    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PropertyValue
    {
        [FieldOffset(0)] internal ushort Kind;
        [FieldOffset(8)] internal nint Data;
    }

    [DllImport("ole32.dll")]
    private static extern int CoInitializeEx(nint reserved, uint kind);

    [DllImport("ole32.dll")]
    private static extern void CoUninitialize();

    [DllImport("ole32.dll")]
    private static extern int CoCreateInstance(in Guid clsid, nint outer, uint context, in Guid iid, out nint result);
}
