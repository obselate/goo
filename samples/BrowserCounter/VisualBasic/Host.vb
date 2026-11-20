Imports System
Imports System.Reflection
Imports Goo
Imports Goo.Wasm

Module BrowserMain
    Sub Main(args As String())
        Using stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Goo.Counter.Font.ttf")
            If stream Is Nothing Then Throw New InvalidOperationException("Missing counter font")
            Dim bytes = GC.AllocateUninitializedArray(Of Byte)(Convert.ToInt32(stream.Length))
            stream.ReadExactly(bytes, 0, bytes.Length)
            Dim font As New FontSource("sans-serif", 400, False, bytes)
            font.Register()
        End Using
        If OperatingSystem.IsBrowser() Then BrowserWindowHost.Configure()
        Program.Main(args)
    End Sub
End Module
