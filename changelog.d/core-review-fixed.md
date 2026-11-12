## Fixed

- Reject contained hit-test subtrees early and reuse the committed hover route for scrollbar hover.
- Check known input targets through their parent links instead of scanning the whole tree.
- Compute dirty fiber depths once and keep parent-first rebuild order with a stable tie order.
- Allow a nested posted-action drain to consume the remaining queue without a dequeue error.
