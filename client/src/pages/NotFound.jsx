import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { BrainCircuit } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md"
      >
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center">
            <BrainCircuit className="w-8 h-8 text-indigo-600" />
          </div>
        </div>
        <h1 className="text-6xl font-bold text-zinc-200 mb-3">404</h1>
        <h2 className="text-xl font-semibold text-zinc-900 mb-2">Page not found</h2>
        <p className="text-zinc-500 mb-6">The page you're looking for doesn't exist or has been moved.</p>
        <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
          <Link to="/dashboard">Back to Dashboard</Link>
        </Button>
      </motion.div>
    </div>
  );
}
