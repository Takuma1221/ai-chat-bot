// src/components/MessageBubble.tsx
type Props = {
  role: 'user' | 'assistant';
  content: string;
};

export default function MessageBubble({ role, content }: Props) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-500 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}
      >
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
