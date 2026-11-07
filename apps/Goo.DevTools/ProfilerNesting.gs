package GooDevTools

import System
import System.Collections.Generic

/// One duration scope copied from a profiler record so nesting can run off the UI thread.
internal data struct ProfilerScope {
    var Record int32
    var Ticks int64
    var EndTicks int64
    var Name string
    var Track int32
    var Window string
    var Thread uint64?
    var Pump uint64?
    var Allocated int64
    var Observed bool
}

/// Scope depth, exclusive time and self-allocated bytes for one trace revision.
internal class ProfilerNesting {
    /// Record indices of nested scopes in start order.
    internal let Nested List[int32] = List[int32]()
    /// Exclusive work and self-allocated bytes keyed by track, window and pump.
    internal let FrameTotals Dictionary[string, []int64] = Dictionary[string, []int64]()
    /// Rows used by each timing track.
    internal let TrackRows[]int32 = []int32{1, 1, 1}
    /// Depth per record index, or -1 when the record is not a nested scope.
    internal let Depths[]int32
    /// Exclusive ticks per record index.
    internal let Exclusive[]int64
    /// Self-allocated bytes per record index, or -1 without allocation data.
    internal let SelfAllocated[]int64
    /// Whether a record repeats the name of an enclosing scope on its thread.
    internal let Repeated[]bool

    /// Nests the scopes of a trace with the given record count. Sorts the scopes in place.
    init(scopes[]ProfilerScope, count int32) {
        Depths = [count]int32
        Exclusive = [count]int64
        SelfAllocated = [count]int64
        Repeated = [count]bool
        Array.Fill(Depths, -1)
        Array.Sort(
            scopes,
            (x ProfilerScope, y ProfilerScope) -> x.Ticks != y.Ticks ? x.Ticks.CompareTo(y.Ticks): y.EndTicks.CompareTo(
                x.EndTicks
            )
        )
        let stacks = Dictionary[string, List[int32]]()
        for position in 0 ... scopes.Length {
            let s = scopes[position]
            let lane = Open(scopes, stacks, s.Track.ToString() + ":" + s.Window, s.Ticks)
            let owner = Open(scopes, stacks, s.Window + "@" + s.Thread.ToString(), s.Ticks)
            Nested.Add(s.Record)
            Depths[s.Record] = lane.Count
            TrackRows[s.Track] = Math.Max(TrackRows[s.Track], lane.Count + 1)
            Exclusive[s.Record] = s.EndTicks - s.Ticks
            SelfAllocated[s.Record] = s.Allocated
            if !s.Observed {
                for ancestor in owner {
                    Repeated[s.Record] = Repeated[s.Record] || scopes[ancestor].Name == s.Name
                }
                if owner.Count > 0 {
                    let parent = scopes[owner[owner.Count - 1]]
                    Exclusive[parent.Record] -= Math.Min(s.EndTicks, parent.EndTicks) - s.Ticks
                    if SelfAllocated[parent.Record] >= 0L && s.Allocated >= 0L {
                        SelfAllocated[parent.Record] -= s.Allocated
                    }
                }
                owner.Add(position)
            }
            lane.Add(position)
        }
        for s in scopes {
            if s.Name == "CapWait" || s.Observed {
                continue
            }
            let key = s.Track.ToString() + ":" + s.Window + ":" + s.Pump.ToString()
            if !FrameTotals.TryGetValue(key, out var totals) {
                totals = []int64{0L, -1L}
                FrameTotals.Add(key, totals)
            }
            totals[0] += Math.Max(0L, Exclusive[s.Record])
            if SelfAllocated[s.Record] >= 0L {
                totals[1] = Math.Max(0L, totals[1]) + SelfAllocated[s.Record]
            }
        }
    }

    shared {
        private func Open(scopes[]ProfilerScope, stacks Dictionary[string, List[int32]], key string, ticks int64) List[
            int32
        ] {
            if !stacks.TryGetValue(key, out var stack) {
                stack = List[int32]()
                stacks.Add(key, stack)
            }
            while stack.Count > 0 && scopes[stack[stack.Count - 1]].EndTicks <= ticks {
                stack.RemoveAt(stack.Count - 1)
            }
            return stack
        }
    }
}
