export interface SendMessageOptions {
  quotedMessageId?: string;
  quotedMessageFromMe?: boolean;
  linkPreview?: boolean;
}

export interface SendMediaOptions {
  caption?: string;
  sendAudioAsVoice?: boolean;
  sendMediaAsDocument?: boolean;
  quotedMessageId?: string;
  // a WhatsApp sticker (a .webp image) and a GIF (a short mp4 played in a loop, as WhatsApp sends GIFs)
  sendMediaAsSticker?: boolean;
  sendVideoAsGif?: boolean;
}
