using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Runtime.Versioning;
using Microsoft.Win32;

[SupportedOSPlatform("windows")]
internal sealed class InstalledIdentity : IDisposable
{
    private readonly string scheme;
    private readonly string shortcut;

    internal InstalledIdentity(string identifier, string scheme)
    {
        this.scheme = scheme;
        shortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), scheme + ".lnk");
        using (var protocol = Registry.CurrentUser.CreateSubKey(@"Software\Classes\" + scheme))
        {
            protocol.SetValue("URL Protocol", "");
            using var command = protocol.CreateSubKey(@"shell\open\command");
            command.SetValue("", $"\"{Environment.ProcessPath}\" --goo-notification \"%1\"");
        }
        object link = Activator.CreateInstance(Type.GetTypeFromCLSID(new("00021401-0000-0000-c000-000000000046"), true)!)!;
        try
        {
            ((IShellLink)link).SetPath(Environment.ProcessPath!);
            SetProperty((IPropertyStore)link, 5, identifier);
            SetProperty((IPropertyStore)link, 26, Guid.NewGuid());
            ((IPropertyStore)link).Commit();
            ((IPersistFile)link).Save(shortcut, true);
        }
        finally { Marshal.FinalReleaseComObject(link); }
    }

    public void Dispose()
    {
        File.Delete(shortcut);
        Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\" + scheme, false);
    }

    private static void SetProperty(IPropertyStore store, uint id, object value)
    {
        var key = new PropertyKey { Format = new("9f4c2855-9f79-4b39-a8d0-e1d42de1d5f3"), Id = id };
        var variant = new PropertyValue();
        if (value is string text)
        {
            variant.Kind = 31;
            variant.Data = Marshal.StringToCoTaskMemUni(text);
        }
        else
        {
            variant.Kind = 72;
            variant.Data = Marshal.AllocCoTaskMem(16);
            Marshal.StructureToPtr((Guid)value, variant.Data, false);
        }
        try { store.SetValue(ref key, ref variant); }
        finally { Marshal.FreeCoTaskMem(variant.Data); }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PropertyKey { internal Guid Format; internal uint Id; }

    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PropertyValue
    {
        [FieldOffset(0)] internal ushort Kind;
        [FieldOffset(8)] internal nint Data;
    }

    [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        void GetCount(out uint count);
        void GetAt(uint index, out PropertyKey key);
        void GetValue(ref PropertyKey key, out PropertyValue value);
        void SetValue(ref PropertyKey key, ref PropertyValue value);
        void Commit();
    }

    [ComImport, Guid("000214f9-0000-0000-c000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellLink
    {
        void GetPath(nint path, int count, nint data, uint flags);
        void GetIdList(out nint list);
        void SetIdList(nint list);
        void GetDescription(nint value, int count);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string value);
        void GetWorkingDirectory(nint value, int count);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string value);
        void GetArguments(nint value, int count);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string value);
        void GetHotkey(out ushort value);
        void SetHotkey(ushort value);
        void GetShowCommand(out int value);
        void SetShowCommand(int value);
        void GetIconLocation(nint value, int count, out int index);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string value, int index);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string value, uint reserved);
        void Resolve(nint window, uint flags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
    }
}
