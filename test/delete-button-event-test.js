import { describe, it, expect, vi } from 'vitest';

describe('Delete Button Event Handling', () => {
  it('should demonstrate the difference between e.target and e.currentTarget', () => {
    // Create a button with data attribute
    const button = document.createElement('button');
    button.className = 'delete-btn danger';
    button.setAttribute('data-session-id', 'test-123');
    button.textContent = 'Delete';
    
    document.body.appendChild(button);
    
    // Track what we get from the event
    let targetSessionId;
    let currentTargetSessionId;
    
    button.addEventListener('click', (e) => {
      targetSessionId = e.target.dataset.sessionId;
      currentTargetSessionId = e.currentTarget.dataset.sessionId;
    });
    
    // Simulate a click
    button.click();
    
    // Both should work for a simple button
    expect(targetSessionId).toBe('test-123');
    expect(currentTargetSessionId).toBe('test-123');
    
    document.body.removeChild(button);
  });
  
  it('should show that e.target can fail when button has nested elements', () => {
    // Create a button with nested content (like an icon + text)
    const button = document.createElement('button');
    button.className = 'delete-btn danger';
    button.setAttribute('data-session-id', 'test-456');
    
    const icon = document.createElement('span');
    icon.textContent = '🗑 ';
    button.appendChild(icon);
    
    const text = document.createTextNode('Delete');
    button.appendChild(text);
    
    document.body.appendChild(button);
    
    // Track what we get from the event
    let targetSessionId;
    let currentTargetSessionId;
    
    button.addEventListener('click', (e) => {
      targetSessionId = e.target.dataset?.sessionId;
      currentTargetSessionId = e.currentTarget.dataset.sessionId;
    });
    
    // Click on the icon (nested element)
    icon.click();
    
    // e.target will be the icon (no dataset)
    // e.currentTarget will still be the button (has dataset)
    expect(targetSessionId).toBeUndefined();
    expect(currentTargetSessionId).toBe('test-456');
    
    document.body.removeChild(button);
  });
  
  it('should demonstrate the fix using e.currentTarget', () => {
    const button = document.createElement('button');
    button.className = 'delete-btn danger';
    button.setAttribute('data-session-id', 'test-789');
    
    const span = document.createElement('span');
    span.textContent = 'Delete';
    button.appendChild(span);
    
    document.body.appendChild(button);
    
    const mockDeleteSession = vi.fn();
    
    // Using e.currentTarget (correct way)
    button.addEventListener('click', async (e) => {
      const sessionId = e.currentTarget.dataset.sessionId;
      await mockDeleteSession(sessionId);
    });
    
    // Even if we click on the span, it should work
    span.click();
    
    expect(mockDeleteSession).toHaveBeenCalledWith('test-789');
    
    document.body.removeChild(button);
  });
});

