Imports System
Imports System.IO
Imports System.Reflection
Imports Goo
Imports Goo.Wasm

Module BrowserMain
    Sub Main(args As String())
        Using stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Goo.Counter.Font.ttf")
            If stream Is Nothing Then Throw New InvalidOperationException("Missing counter font")
            Using bytes As New MemoryStream()
                stream.CopyTo(bytes)
                Dim font As New FontSource("sans-serif", 400, False, bytes.ToArray())
                font.Register()
            End Using
        End Using
        If OperatingSystem.IsBrowser() Then BrowserWindowHost.Configure()
        Program.Main(args)
    End Sub
End Module
