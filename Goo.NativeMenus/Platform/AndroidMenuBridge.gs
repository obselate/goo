package Goo

import System
import System.Collections.Generic
import System.Threading.Tasks
import Goo.Android

internal sealed class AndroidMenuBridge {
    shared {
        internal func Show(owner Window, point Point, snapshot NativeMenuSnapshot) Task[NativeMenuResult] {
            for item in snapshot.Actions {
                if item.Shortcut != nil { return Task.FromResult(NativeMenuResult(NativeMenuStatus.Unsupported)) }
            }
            let view = GooView.TryGetNativeOwner(owner)
            if view == nil { return Task.FromResult(NativeMenuResult(NativeMenuStatus.OwnerClosed)) }
            let lease = owner.BeginNativeModal(out var status)
            if lease == nil {
                return Task.FromResult(NativeMenuResult(if status == NativeModalStatus.Busy {
                    NativeMenuStatus.Busy
                } else { NativeMenuStatus.OwnerClosed }))
            }
            let completion = TaskCompletionSource[NativeMenuResult](TaskCreationOptions.RunContinuationsAsynchronously)
            var session NativeContextMenu?
            var completed = false
            let finish Action[AndroidContextMenuStatus, string, string] = (nativeStatus, id, error) -> {
                if completed { return }
                completed = true
                let closing = lease.IsOwnerClosing
                try {
                    lease.Dispose()
                    let resultStatus = if closing || !owner.IsOpen { NativeMenuStatus.OwnerClosed }
                        else if nativeStatus == AndroidContextMenuStatus.Success { NativeMenuStatus.Success }
                        else if nativeStatus == AndroidContextMenuStatus.Cancelled { NativeMenuStatus.Cancelled }
                        else if nativeStatus == AndroidContextMenuStatus.Unsupported { NativeMenuStatus.Unsupported }
                        else if nativeStatus == AndroidContextMenuStatus.OwnerClosed { NativeMenuStatus.OwnerClosed }
                        else { NativeMenuStatus.Failed }
                    completion.TrySetResult(NativeMenuResult(resultStatus,
                        if resultStatus == NativeMenuStatus.Success { id } else { "" }, error))
                } catch (failure Exception) {
                    completion.TrySetResult(NativeMenuResult(NativeMenuStatus.Failed, error: failure.Message))
                }
                return
            }
            lease.Closing = () -> session?.OwnerClosed()
            let rows = Copy(snapshot.Items)
            if !owner.TryPost(() -> {
                if lease.IsOwnerClosing {
                    finish(AndroidContextMenuStatus.OwnerClosed, "", "")
                } else {
                    session = NativeContextMenu.Show(view, float32(point.X * owner.UiScale),
                        float32(point.Y * owner.UiScale), rows, finish)
                }
                return
            }) { finish(AndroidContextMenuStatus.OwnerClosed, "", "") }
            return completion.Task
        }

        private func Copy(items IReadOnlyList[NativeMenuItem]) []AndroidNativeMenuRow {
            let rows = [items.Count]AndroidNativeMenuRow
            for i in 0 ... items.Count {
                let item = items[i]
                rows[i] = AndroidNativeMenuRow(item.Id, item.Text, item.Enabled, item.Checked,
                    item.Separator, Copy(item.Items))
            }
            return rows
        }
    }
}
