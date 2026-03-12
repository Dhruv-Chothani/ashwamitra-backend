/**
 * Real-time event emitter utility
 * Broadcasts events to connected WebSocket clients
 */

const emitRealtimeEvent = (io, eventType, data, targetRole = null, targetUserId = null) => {
  try {
    const eventData = {
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    };

    // Broadcast to specific role
    if (targetRole) {
      io.to(`role-${targetRole}`).emit(eventType, eventData);
      console.log(`📡 Real-time event (${eventType}) broadcasted to role: ${targetRole}`);
    }
    // Broadcast to specific user
    else if (targetUserId) {
      io.to(`user-${targetUserId}`).emit(eventType, eventData);
      console.log(`📡 Real-time event (${eventType}) sent to user: ${targetUserId}`);
    }
    // Broadcast to all connected clients
    else {
      io.emit(eventType, eventData);
      console.log(`📡 Real-time event (${eventType}) broadcasted to all clients`);
    }
  } catch (error) {
    console.error('❌ Error emitting real-time event:', error);
  }
};

/**
 * Event types for real-time updates
 */
const EVENT_TYPES = {
  NEW_REGISTRATION: 'new-registration',
  NEW_ORDER: 'new-order',
  ORDER_STATUS_UPDATE: 'order-status-update',
  DELIVERY_STATUS_UPDATE: 'delivery-status-update',
  NEW_PRODUCT: 'new-product',
  PRODUCT_UPDATE: 'product-update',
  PAYMENT_STATUS_UPDATE: 'payment-status-update',
  WALLET_UPDATE: 'wallet-update',
  FARMER_APPROVAL: 'farmer-approval',
  BUSINESS_VERIFICATION: 'business-verification',
  USER_STATUS_UPDATE: 'user-status-update'
};

module.exports = {
  emitRealtimeEvent,
  EVENT_TYPES
};
