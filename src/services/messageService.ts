import { apiClient, Endpoints } from '../api';

export type MessageType = 'text' | 'voice' | 'image' | 'video' | 'file' | 'sticker' | 'location';

export interface AttachmentMeta {
  duration?:      number;
  filename?:      string;
  size?:          number;
  thumbnail_url?: string;
  width?:         number;
  height?:        number;
  mime_type?:     string;
  latitude?:      number;
  longitude?:     number;
  address?:       string | null;
}

export interface ConversationSummary {
  partner_id:   string;
  partner: {
    id:          string;
    username:    string;
    full_name?:  string;
    avatar_url?: string;
    is_online?:  boolean;
    is_verified?: boolean;
    last_seen_at?: string;
  };
  last_message: string;
  last_time:    string;
  unread_count: number;
}

export interface Message {
  id:              string;
  sender_id:       string;
  receiver_id:     string;
  content:         string;
  message_type:    MessageType;
  attachment_url?: string;
  attachment_meta?: AttachmentMeta;
  created_at:      string;
  read:            boolean;
  edited_at?:      string;
  deleted?:        boolean;
  pending?:        boolean;
}

export const messageService = {
  async getUnreadCount(): Promise<number> {
    const res = await apiClient.get<{ unread_count: number }>(Endpoints.messages.unreadCount);
    return res.data.unread_count;
  },

  async getConversations(): Promise<ConversationSummary[]> {
    const res = await apiClient.get<ConversationSummary[]>(Endpoints.messages.conversations);
    return res.data;
  },

  async getMessages(partnerId: string, page = 1, limit = 30): Promise<Message[]> {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
    const res = await apiClient.get<Message[]>(`${Endpoints.messages.conversation(partnerId)}?${query}`);
    return res.data;
  },

  async sendMessage(
    partnerId: string,
    content: string,
    messageType: MessageType = 'text',
    attachmentUrl?: string,
    attachmentMeta?: AttachmentMeta,
  ): Promise<Message> {
    const body: any = { content, message_type: messageType };
    if (attachmentUrl) body.attachment_url = attachmentUrl;
    if (attachmentMeta) body.attachment_meta = attachmentMeta;
    const res = await apiClient.post<Message>(Endpoints.messages.conversation(partnerId), body);
    return res.data;
  },

  async markRead(partnerId: string): Promise<void> {
    await apiClient.put(Endpoints.messages.markRead(partnerId));
  },

  async editMessage(messageId: string, content: string): Promise<Message> {
    const res = await apiClient.patch<Message>(Endpoints.messages.message(messageId), { content });
    return res.data;
  },

  async deleteMessage(messageId: string): Promise<void> {
    await apiClient.delete(Endpoints.messages.message(messageId));
  },

  async reactToMessage(messageId: string, emoji: string): Promise<{ message_id: string; user_id: string; emoji: string | null }> {
    const res = await apiClient.post(`/api/v1/messages/${messageId}/react`, { emoji });
    return res.data;
  },
};
