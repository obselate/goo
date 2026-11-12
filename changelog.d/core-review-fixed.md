## Fixed

- Reject contained hit-test subtrees early and reuse the committed hover route for scrollbar hover.
- Check known input targets through their parent links instead of scanning the whole tree.
- Compute dirty fiber depths once and keep parent-first rebuild order with a stable tie order.
- Allow a nested posted-action drain to consume the remaining queue without a dequeue error.
- Preserve application stack frames when cleanup, native callbacks and deferred rendering errors are delivered.
- Coalesce pending SDL wake events and avoid faulting GPU completion when the event queue is full.
- Evict least-recently-used image cache entries that no returned source or mounted lease owns.
- Drain native modal completion during close and bound event-serviced cleanup when Window.Run fails.
- Report repeated alternating element metrics once per episode when window diagnostics are enabled.
