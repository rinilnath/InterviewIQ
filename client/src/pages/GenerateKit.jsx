import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Plus, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/lib/api';
import { SENIORITY_LEVELS } from '@/lib/utils';
import { toast } from '@/hooks/useToast';
import { useGeneratingKitsStore } from '@/store/generatingKitsStore';

const schema = z.object({
  jdText: z.string().min(50, 'Job description must be at least 50 characters'),
  seniorityLevel: z.string().min(1, 'Please select a seniority level'),
  customExpectations: z.string().optional(),
  useKnowledgeBase: z.boolean().default(false),
});

const COMMON_TECH = [
  'React', 'Node.js', 'Python', 'Java', 'TypeScript', 'AWS', 'Docker',
  'PostgreSQL', 'MongoDB', 'Spring Boot', 'Angular', 'Vue.js', 'Kubernetes',
  'Microservices', 'REST API', 'GraphQL', 'Redis', 'CI/CD', 'Terraform', 'Azure', 'GCP',
];

export default function GenerateKit() {
  const navigate = useNavigate();
  const { add: addGeneratingKit } = useGeneratingKitsStore();
  const [techStack, setTechStack] = useState([]);
  const [techInput, setTechInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { useKnowledgeBase: false },
  });

  const addTech = (tech) => {
    const trimmed = tech.trim();
    if (trimmed && !techStack.includes(trimmed)) setTechStack((s) => [...s, trimmed]);
    setTechInput('');
  };

  const removeTech = (tech) => setTechStack((s) => s.filter((t) => t !== tech));

  const handleTechKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTech(techInput); }
  };

  const onSubmit = async (data) => {
    if (techStack.length === 0) {
      toast.error('Tech stack required', 'Please add at least one technology.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await api.post('/interview/generate', { ...data, techStack });
      const kit = res.data.kit;

      // Register with global watcher so toast fires even if user navigates elsewhere
      addGeneratingKit(kit.id, kit.kit_title);

      toast.success('Generation started!', 'Your kit is being built in the background.');
      reset();
      setTechStack([]);
      navigate(`/kit/${kit.id}`);
    } catch (err) {
      toast.error('Failed to start generation', err.response?.data?.error || 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">Generate Interview Kit</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Generation runs in the background — submit multiple kits and continue working freely.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* JD */}
        <Card className="border-zinc-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Job Description</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Paste the full job description here..."
              className={`min-h-[180px] text-sm ${errors.jdText ? 'border-rose-400' : ''}`}
              {...register('jdText')}
            />
            {errors.jdText && <p className="text-xs text-rose-600 mt-1">{errors.jdText.message}</p>}
          </CardContent>
        </Card>

        {/* Seniority + Tech Stack */}
        <Card className="border-zinc-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Role Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Seniority Level</Label>
              <Controller
                name="seniorityLevel"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className={errors.seniorityLevel ? 'border-rose-400' : ''}>
                      <SelectValue placeholder="Select seniority level..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SENIORITY_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>{level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.seniorityLevel && <p className="text-xs text-rose-600">{errors.seniorityLevel.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Tech Stack</Label>
              <div className="flex gap-2">
                <Input
                  value={techInput}
                  onChange={(e) => setTechInput(e.target.value)}
                  onKeyDown={handleTechKeyDown}
                  placeholder="Type technology and press Enter..."
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => addTech(techInput)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {techStack.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {techStack.map((tech) => (
                    <motion.span
                      key={tech}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium"
                    >
                      {tech}
                      <button type="button" onClick={() => removeTech(tech)} className="hover:text-indigo-900">
                        <X className="w-3 h-3" />
                      </button>
                    </motion.span>
                  ))}
                </div>
              )}
              <div className="pt-1">
                <p className="text-xs text-zinc-500 mb-2">Common technologies:</p>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_TECH.filter((t) => !techStack.includes(t)).slice(0, 12).map((tech) => (
                    <button
                      key={tech}
                      type="button"
                      onClick={() => addTech(tech)}
                      className="text-xs px-2 py-0.5 border border-zinc-200 rounded text-zinc-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      + {tech}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custom Expectations */}
        <Card className="border-zinc-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Additional Context <span className="text-zinc-400 font-normal text-sm">(Optional)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Custom Expectations</Label>
              <Textarea
                placeholder="Any specific requirements, client expectations, or focus areas..."
                className="min-h-[100px] text-sm"
                {...register('customExpectations')}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 border border-zinc-200">
              <div>
                <p className="text-sm font-medium text-zinc-900">Use Knowledge Base</p>
                <p className="text-xs text-zinc-500 mt-0.5">Include questions from uploaded documents (25% of total)</p>
              </div>
              <Controller
                name="useKnowledgeBase"
                control={control}
                render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-indigo-600 hover:bg-indigo-700 h-11 text-base font-medium"
        >
          {isSubmitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Starting generation...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate Interview Kit</>
          )}
        </Button>
      </form>
    </div>
  );
}
