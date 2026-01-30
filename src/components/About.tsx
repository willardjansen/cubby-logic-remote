'use client';

import { useState, FormEvent } from 'react';

export default function About() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [subscribeMessage, setSubscribeMessage] = useState('');

  const handleSubscribe = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setSubscribeStatus('error');
      setSubscribeMessage('Please enter a valid email address');
      return;
    }

    setSubscribeStatus('loading');
    try {
      const response = await fetch('https://cubby-control-center.vercel.app/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          product_interest: ['cubby-logic-remote'],
          source: 'cubby-logic-remote',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSubscribeStatus('success');
        setSubscribeMessage(data.already_subscribed ? "You're already subscribed!" : 'Thanks for subscribing!');
        setEmail('');
      } else {
        throw new Error(data.error || 'Failed to subscribe');
      }
    } catch {
      setSubscribeStatus('error');
      setSubscribeMessage('Something went wrong. Please try again.');
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700
                   text-gray-400 hover:text-white flex items-center justify-center text-lg font-serif
                   transition-colors z-50"
        title="About"
      >
        i
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl max-w-md w-full p-6 relative border border-gray-700
                      max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 text-gray-500 hover:text-white text-2xl leading-none"
        >
          &times;
        </button>

        <h2 className="text-xl font-bold text-white mb-1">
          Cubby Logic Remote
        </h2>
        <p className="text-gray-400 text-sm mb-4">
          Free &amp; Open Source under GPL-3.0
        </p>

        <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3 mb-4">
          <p className="text-amber-200 text-sm">
            <strong>Scam Warning:</strong> This app is FREE. If you paid for it, you were scammed.
            Only download from the official source below.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <a
            href="https://github.com/willardjansen/cubby-logic-remote"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 text-gray-300 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span>Official GitHub Repository</span>
          </a>
        </div>

        {/* Newsletter Signup */}
        <div className="border-t border-gray-700 pt-4 mb-4">
          <p className="text-gray-300 text-sm font-medium mb-2">
            Stay Updated
          </p>
          <p className="text-gray-500 text-xs mb-3">
            Get notified about new features and updates.
          </p>

          {subscribeStatus === 'success' ? (
            <div className="text-[#F4A5C6] text-sm px-4 py-2 bg-[#F4A5C6]/10 rounded-lg">
              {subscribeMessage}
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={subscribeStatus === 'loading'}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg
                         text-gray-200 text-sm placeholder:text-gray-600
                         focus:outline-none focus:border-[#F4A5C6]/50 transition-colors"
              />
              <button
                type="submit"
                disabled={subscribeStatus === 'loading'}
                className="px-4 py-2 bg-[#F4A5C6] text-gray-900 rounded-lg text-sm font-semibold
                         hover:opacity-90 disabled:opacity-70 disabled:cursor-wait transition-all"
              >
                {subscribeStatus === 'loading' ? '...' : 'Subscribe'}
              </button>
            </form>
          )}

          {subscribeStatus === 'error' && (
            <p className="text-red-400 text-xs mt-2">{subscribeMessage}</p>
          )}
        </div>

        {/* Support Section */}
        <div className="border-t border-gray-700 pt-4">
          <p className="text-gray-400 text-sm mb-3">
            If you find this useful, please consider supporting development:
          </p>
          <a
            href="https://paypal.me/willardjansen"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.771.771 0 0 1 .757-.629h6.724c2.332 0 4.058.636 5.127 1.887.971 1.134 1.303 2.7 1.014 4.788-.29 2.087-1.137 3.767-2.521 4.99-1.321 1.166-3.08 1.758-5.227 1.758H8.467a.77.77 0 0 0-.758.628l-.633 4.195zm.445-6.828h1.988c2.095 0 3.588-.996 4.07-3.205.253-1.161.086-2.057-.469-2.664-.554-.605-1.508-.91-2.837-.91H8.236l-1.715 6.779z"/>
            </svg>
            Donate via PayPal
          </a>
        </div>

        <p className="text-gray-500 text-xs mt-4">
          &copy; {new Date().getFullYear()} Cubby Composer. All rights reserved.
        </p>
      </div>
    </div>
  );
}
