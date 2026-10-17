package Goo

import System
import System.Globalization
import System.Text
import System.Text.Json

internal partial class DiagnosticPipeHost {
    private func profileInteger(payload JsonElement, name string, fallback int64) int64 {
        if !payload.TryGetProperty(name, out var value) {
            return fallback
        }
        if value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var number) && number >= 0L {
            return number
        }
        if value.ValueKind == JsonValueKind.String
        && Int64.TryParse(value.GetString(), NumberStyles.None, CultureInfo.InvariantCulture, out var parsed) {
            return parsed
        }
        throw ArgumentException(name + " must be a nonnegative integer.")
    }

    private func startProfile(client DiagnosticPipeClient, payload JsonElement) string {
        let requested = profileInteger(payload, "bufferBytes", int64(FrameRecorder.DefaultBufferBytes))
        let bufferBytes = int32(Math.Clamp(requested, 65536L, int64(FrameRecorder.DefaultBufferBytes)))
        lock client {
            if client.IsClosed {
                throw ObjectDisposedException("DiagnosticPipeClient")
            }
            if client.TraceOwner == Guid.Empty {
                client.TraceOwner = Guid.NewGuid()
            }
            if let previous = client.Recorder {
                if previous.Owns(client.TraceOwner) && Object.ReferenceEquals(FrameRecorder.Current, previous) {
                    return "{\"command\":\"profiler.start\",\"state\":\"Busy\"}"
                }
            }
            let recorder = FrameRecorder.Start(client.TraceOwner, bufferBytes)
            guard let current = recorder else {
                return "{\"command\":\"profiler.start\",\"state\":\"Busy\"}"
            }
            client.Recorder = current
            session.SampleProfile(current)
            var device = session.ProfileMetadata()
            device.Ticks = System.Diagnostics.Stopwatch.GetTimestamp() - current.Origin
            current.Publish(device)
            Window.ProfileWindows(current, endpoint.WindowId)
            let result = StringBuilder()
            result
                .Append("{\"command\":\"profiler.start\",\"state\":\"Recording\",\"traceId\":")
                .Append(quote(current.TraceId))
                .Append(",\"schemaVersion\":1,\"pid\":")
                .Append(endpoint.ProcessId)
                .Append(",\"sessionId\":")
                .Append(quote(endpoint.SessionId))
                .Append(",\"windowId\":")
                .Append(quote(endpoint.WindowId))
                .Append(",\"originTicks\":")
                .Append(quote(current.Origin.ToString(CultureInfo.InvariantCulture)))
                .Append(",\"frequency\":")
                .Append(quote(System.Diagnostics.Stopwatch.Frequency.ToString(CultureInfo.InvariantCulture)))
                .Append(",\"startedUtc\":")
                .Append(quote(current.StartedUtc))
                .Append(",\"categories\":[\"frames\",\"cpu\",\"queue\",\"gpu\",\"memory\",\"resources\"],\"samplingIntervals\":{\"managedMs\":100,\"processMs\":500,\"driverMs\":500},\"bufferBytes\":")
                .Append(current.BufferBytes)
                .Append(",\"maxBatchBytes\":")
                .Append(FrameRecorder.MaxBatchBytes)
                .Append(",\"devices\":[{\"id\":")
                .Append(traceId(device.Context.DeviceId))
                .Append(",\"generation\":")
                .Append(traceId(device.Context.DeviceGeneration))
                .Append(",\"name\":")
                .Append(traceText(device.Name, 128))
                .Append(",\"source\":")
                .Append(traceText(device.Source, 64))
                .Append(",\"validity\":")
                .Append(traceText(device.Validity, 32))
                .Append("}]")
                .Append(",\"gpuTiming\":\"per-submission-elapsed\",\"baseline\":[]")
                .Append(
                ",\"phaseSemantics\":{\"Paint\":\"entire target.Render\",\"Diff\":\"derived, not a duration\",\"Frame\":\"pump work excluding native wait\",\"allocatedBytes\":\"current-thread traffic, nested totals overlap\"}"
            )
                .Append(
                ",\"frameResults\":{\"-1\":\"failed\",\"0\":\"skipped\",\"1\":\"rendered\",\"2\":\"deferred\"},\"phaseNames\":["
            )
            for i in 0 ... int32(FrameProfileStage.Count) {
                if i > 0 {
                    result.Append(",")
                }
                result.Append(quote(FrameProfileStage(i).ToString()))
            }
            result.Append("],\"ownerKinds\":")
                .Append(JsonSerializer.Serialize(Enum.GetNames[VulkanMemoryOwnerKind]()))
                .Append(",\"resourceKinds\":")
                .Append(JsonSerializer.Serialize(Enum.GetNames[FrameResourceKind]()))
                .Append("}")
            return result.ToString()
        }
    }

    private func requireProfile(client DiagnosticPipeClient, payload JsonElement) FrameRecorder {
        guard let current = client.Recorder else {
            throw ArgumentException("No trace belongs to this client.")
        }
        if text(payload, "traceId") != current.TraceId || !current.Owns(client.TraceOwner) {
            throw ArgumentException("traceId does not belong to this client.")
        }
        return current
    }

    private func stopProfile(client DiagnosticPipeClient, payload JsonElement) string {
        let current = requireProfile(client, payload)
        if Object.ReferenceEquals(FrameRecorder.Current, current) { session.SampleProfile(current, force: true) }
        current.Stop(false)
        return "{\"command\":\"profiler.stop\",\"traceId\":" + quote(current.TraceId)
        + ",\"state\":\"Stopping\",\"partial\":false,\"more\":true}"
    }

    private func readProfile(client DiagnosticPipeClient, payload JsonElement) string {
        let current = requireProfile(client, payload)
        let afterSeq = profileInteger(payload, "afterSeq", 0L)
        let maxBytes = int32(
            Math.Clamp(
                profileInteger(payload, "maxBytes", int64(FrameRecorder.MaxBatchBytes)),
                8192L,
                int64(FrameRecorder.MaxBatchBytes)
            )
        )
        let values = current.Read(
            afterSeq,
            (maxBytes - 2048) / FrameRecorder.WireRecordBudgetBytes,
            out var nextSeq,
            out var more,
            out var state,
            out var dropped
        )
        let result = StringBuilder()
        result
            .Append("{\"command\":\"profiler.read\",\"traceId\":")
            .Append(quote(current.TraceId))
            .Append(",\"firstSeq\":")
            .Append(
            quote(
                (
                    if values.Length == 0 {
                        nextSeq
                    } else {
                        values[0].Seq
                    }
                ).ToString(CultureInfo.InvariantCulture)
            )
        )
            .Append(",\"nextSeq\":")
            .Append(quote(nextSeq.ToString(CultureInfo.InvariantCulture)))
            .Append(",\"more\":")
            .Append(boolText(more))
            .Append(",\"state\":")
            .Append(
            quote(
                if state == "Partial" {
                    "Complete"
                } else {
                    state
                }
            )
        )
            .Append(",\"partial\":")
            .Append(boolText(state == "Partial"))
            .Append(",\"dropped\":")
            .Append(dropped)
            .Append(",\"pollDelayMs\":")
            .Append(
            if more {
                0
            } else {
                100
            }
        )
            .Append(",\"records\":[")
        for i in 0 ... values.Length {
            if i > 0 {
                result.Append(",")
            }
            appendTraceRecord(result, values[i])
        }
        result.Append("]}")
        return result.ToString()
    }

    private func traceText(value string?, maxLength int32) string {
        guard let actual = value else {
            return "null"
        }
        return quote(
            if actual.Length > maxLength {
                actual.Substring(0, maxLength)
            } else {
                actual
            }
        )
    }

    private func traceId(value uint64) string -> if value == 0uL {
        "null"
    } else {
        quote(value.ToString(CultureInfo.InvariantCulture))
    }

    private func optional(value uint32?) string {
        guard let actual = value else {
            return "null"
        }
        return actual.ToString(CultureInfo.InvariantCulture)
    }

    private func optional(value uint64?) string {
        guard let actual = value else {
            return "null"
        }
        return actual.ToString(CultureInfo.InvariantCulture)
    }

    private func appendTraceRecord(b StringBuilder, r FrameTraceRecord) {
        let c = r.Context
        b
            .Append("{\"seq\":")
            .Append(quote(r.Seq.ToString(CultureInfo.InvariantCulture)))
            .Append(",\"kind\":")
            .Append(quote(r.Kind.ToString().ToLowerInvariant()))
            .Append(",\"ticks\":")
            .Append(quote(r.Ticks.ToString(CultureInfo.InvariantCulture)))
            .Append(",\"endTicks\":")
            .Append(
            if r.Kind == FrameTraceKind.Duration {
                quote(r.EndTicks.ToString(CultureInfo.InvariantCulture))
            } else {
                "null"
            }
        )
            .Append(",\"threadId\":")
            .Append(optional(r.ThreadId))
            .Append(",\"windowId\":")
            .Append(traceText(c.WindowId, 64))
            .Append(",\"pumpId\":")
            .Append(traceId(c.PumpId))
            .Append(",\"frameId\":")
            .Append(traceId(c.FrameId))
            .Append(",\"submissionId\":")
            .Append(traceId(c.SubmissionId))
            .Append(",\"sceneVersion\":")
            .Append(traceId(c.SceneVersion))
            .Append(",\"generation\":")
            .Append(traceId(c.Generation))
            .Append(",\"imageIndex\":")
            .Append(optional(c.ImageIndex))
            .Append(",\"eventId\":")
            .Append(quote(r.EventId.ToString(CultureInfo.InvariantCulture)))
            .Append(",\"deviceId\":")
            .Append(traceId(c.DeviceId))
            .Append(",\"deviceGeneration\":")
            .Append(traceId(c.DeviceGeneration))
            .Append(",\"category\":")
            .Append(quote(r.Category.ToString(CultureInfo.InvariantCulture)))
            .Append(",\"resourceId\":")
            .Append(traceId(r.ResourceId))
            .Append(",\"parentId\":")
            .Append(traceId(r.ParentId))
            .Append(",\"resourceGeneration\":")
            .Append(traceId(r.ResourceGeneration))
            .Append(",\"resourceKind\":")
            .Append(optional(r.ResourceKind))
            .Append(",\"ownerKind\":")
            .Append(optional(r.OwnerKind))
            .Append(",\"result\":")
            .Append(r.Result)
            .Append(",\"allocatedBytes\":")
            .Append(optional(r.AllocatedBytes))
            .Append(",\"value0\":")
            .Append(optional(r.Value0))
            .Append(",\"value1\":")
            .Append(optional(r.Value1))
            .Append(",\"gpuElapsedNs\":")
            .Append(optional(r.GpuElapsedNs))
            .Append(",\"payloadBytes\":")
            .Append(optional(r.PayloadBytes))
            .Append(",\"requirementBytes\":")
            .Append(optional(r.RequirementBytes))
            .Append(",\"placementBytes\":")
            .Append(optional(r.PlacementBytes))
            .Append(",\"blockBytes\":")
            .Append(optional(r.BlockBytes))
            .Append(",\"x\":")
            .Append(optional(r.X))
            .Append(",\"y\":")
            .Append(optional(r.Y))
            .Append(",\"width\":")
            .Append(optional(r.Width))
            .Append(",\"height\":")
            .Append(optional(r.Height))
            .Append(",\"memoryType\":")
            .Append(optional(r.MemoryType))
            .Append(",\"heapIndex\":")
            .Append(optional(r.HeapIndex))
            .Append(",\"heapFlags\":")
            .Append(optional(r.HeapFlags))
            .Append(",\"dedicated\":")
            .Append(optional(r.Dedicated))
            .Append(",\"sampleTicks\":")
            .Append(optional(r.SampleTicks))
            .Append(",\"gcIndex\":")
            .Append(optional(r.GcIndex))
            .Append(",\"source\":")
            .Append(traceText(r.Source, 64))
            .Append(",\"validity\":")
            .Append(traceText(r.Validity, 32))
            .Append(",\"unit\":")
            .Append(traceText(r.Unit, 16))
            .Append(",\"name\":")
            .Append(traceText(r.Name, 128))
            .Append("}")
    }
}

internal partial class DevToolsSession {
    internal func ProfileMetadata() FrameTraceRecord -> owner.ProfileMetadata()
    internal func SampleProfile(recorder FrameRecorder, force bool = false) { owner.SampleProfile(recorder, force) }
}
