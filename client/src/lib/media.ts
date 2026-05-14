export type CloudinaryFolder = 
  | "item-prise/users/avatars"
  | "item-prise/support/attachments"
  | "item-prise/app/marketing"
  | "item-prise/chat-media";

export const validateMedia = (file: File) => {
  const MAX_SIZE = 3 * 1024 * 1024; // 3MB limit for prototype
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: "Invalid file type. Please upload a JPG, PNG, WebP, or PDF." };
  }
  
  if (file.size > MAX_SIZE) {
    return { valid: false, error: "File is too large. Maximum size is 3MB." };
  }
  
  return { valid: true };
};

export const uploadToCloudinaryMock = async (file: File, folder: CloudinaryFolder): Promise<string> => {
  // Simulate network delay for upload
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // In a real implementation, this would POST to a backend endpoint which then uploads to Cloudinary securely.
  // For the prototype, we use a FileReader to generate a local base64 string to persist state durably.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
