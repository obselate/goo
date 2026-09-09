package GooDevTools

import System
import System.Collections.Generic
import System.IO
import Goo

func Main() {
  Window.ConfigureApplication("Goo DevTools", "0.5.2", "io.github.obselate.goo.devtools")
  let sample = Environment.GetEnvironmentVariable("GOO_DEVTOOLS_SAMPLE") == "1"
    || HasArgument("--sample")
  let endpoints = DiagnosticEndpointDiscovery.Scan(Directory.GetCurrentDirectory())
  let requestedPipe = ArgumentValue("--pipe")
  let requestedPid = ArgumentValue("--pid")
  let selectedEndpoint = SelectEndpoint(endpoints, requestedPipe, requestedPid)
  let transport = if sample {
    DiagnosticTransport(SampleDiagnosticTransport{})
  } else if let endpoint = selectedEndpoint {
    DiagnosticTransport(DiagnosticPipeTransport(endpoint))
  } else if requestedPipe != "" {
    DiagnosticTransport(DiagnosticPipeTransport(DirectEndpoint(requestedPipe, requestedPid)))
  } else {
    DiagnosticTransport(DiagnosticDisconnectedTransport{})
  }
  let session = DiagnosticSession(transport, sample)
  let root = DevToolsCell(session)
  let window = Window{
    Title: "Goo DevTools",
    Width: 1540,
    Height: 960,
    Decorated: false,
    Transparent: true,
    ResizeBand: 8.0F,
    Resizable: true,
    VSync: true,
    Background: Color.Transparent,
    Root: root,
  }
  root.AttachWindow(window)
  if sample || selectedEndpoint != nil || requestedPipe != "" {
    session.Connect()
    session.Pump()
  }
  window.Run()
}

private func HasArgument(value string) bool {
  for argument in Environment.GetCommandLineArgs() {
    if argument == value || argument == value + "=1" {
      return true
    }
  }
  return false
}

private func ArgumentValue(name string) string {
  let arguments = Environment.GetCommandLineArgs()
  var index int32
  while index < arguments.Length {
    if arguments[index] == name && index + 1 < arguments.Length {
      return arguments[index + 1]
    }
    index = index + 1
  }
  return ""
}

private func SelectEndpoint(endpoints List[DiagnosticEndpoint], pipe string, pidText string) DiagnosticEndpoint? {
  var pid int32
  Int32.TryParse(pidText, out pid)
  var selected DiagnosticEndpoint?
  for endpoint in endpoints {
    if pipe != "" && endpoint.PipeName != pipe { continue }
    if pidText != "" && endpoint.ProcessId != pid { continue }
    var shouldSelect = selected == nil
    if let current = selected {
      shouldSelect = IsNewer(endpoint.StartedAt, current.StartedAt)
    }
    if shouldSelect {
      selected = endpoint
    }
  }
  return selected
}

private func IsNewer(candidate string, current string) bool {
  if candidate == "" { return false }
  if current == "" { return true }
  return String.Compare(candidate, current, StringComparison.Ordinal) > 0
}

private func DirectEndpoint(pipe string, pidText string) DiagnosticEndpoint {
  var pid int32
  Int32.TryParse(pidText, out pid)
  return DiagnosticEndpoint{
    ProcessId: pid,
    ProcessName: "Attached target",
    PipeName: pipe,
    Protocol: DiagnosticProtocolVersion{ Major: 1, Minor: 0 },
    Transport: "named-pipe",
    DescriptorPath: "",
    ApplicationName: "",
    WindowTitle: "",
    StartedAt: "",
  }
}
