import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Plus, X, Loader2, AlertTriangle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { SENIORITY_LEVELS } from '@/lib/utils';
import { toast } from '@/hooks/useToast';
import { useGeneratingKitsStore } from '@/store/generatingKitsStore';

const schema = z.object({
  candidateName: z.string().min(1, 'Candidate name is required'),
  candidateExperienceYears: z.coerce.number({ invalid_type_error: 'Enter a number' }).int().min(0, 'Cannot be negative').max(50, 'Must be 50 or less'),
  candidateRole: z.string().min(1, 'Role applied for is required'),
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
  const queryClient = useQueryClient();
  const { add: addGeneratingKit } = useGeneratingKitsStore();
  const [techStack, setTechStack] = useState([]);
  const [techInput, setTechInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [kbPercentage, setKbPercentage] = useState(25);

  const { data: quota } = useQuery({
    queryKey: ['interview', 'quota'],
    queryFn: async () => (await api.get('/interview/quota')).data,
    staleTime: 60_000,
  });

  const quotaExhausted = quota && !quota.isUnlimited && quota.remaining === 0;
  const quotaWarning  = quota && !quota.isUnlimited && quota.remaining > 0 && quota.percentUsed >= 80;

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
      const res = await api.post('/interview/generate', { ...data, techStack, kbPercentage,
        candidateName: data.candidateName, candidateExperienceYears: data.candidateExperienceYears, candidateRole: data.candidateRole });
      const kit = res.data.kit;

      addGeneratingKit(kit.id, kit.kit_title);
      queryClient.invalidateQueries(['interview', 'quota']); // refresh quota bar
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

      {/* Quota banners */}
      {quotaExhausted && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-rose-800">Monthly limit reached</p>
            <p className="text-xs text-rose-600 mt-0.5">
              You've used all {quota.limit} kits on the {quota.tier} plan.
              Quota resets on {new Date(quota.resetsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.
              Contact your admin to upgrade.
            </p>
          </div>
        </div>
      )}
      {quotaWarning && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            <strong>{quota.remaining} kit{quota.remaining !== 1 ? 's' : ''} remaining</strong> this month on your {quota.tier} plan.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Candidate Details */}
        <Card className="border-zinc-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Candidate Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Candidate Name <span className="text-rose-500">*</span></Label>
                <Input
                  placeholder="e.g. Jane Smith"
                  className={errors.candidateName ? 'border-rose-400' : ''}
                  {...register('candidateName')}
                />
                {errors.candidateName && <p className="text-xs text-rose-600">{errors.candidateName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Years of Experience <span className="text-rose-500">*</span></Label>
                <Input
                  type="number"
                  min="0"
                  max="50"
                  placeholder="e.g. 4"
                  className={errors.candidateExperienceYears ? 'border-rose-400' : ''}
                  {...register('candidateExperienceYears')}
                />
                {errors.candidateExperienceYears && <p className="text-xs text-rose-600">{errors.candidateExperienceYears.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Role Applied For <span className="text-rose-500">*</span></Label>
              <Input
                placeholder="e.g. Senior Backend Engineer"
                className={errors.candidateRole ? 'border-rose-400' : ''}
                {...register('candidateRole')}
              />
              {errors.candidateRole && <p className="text-xs text-rose-600">{errors.candidateRole.message}</p>}
            </div>
          </CardContent>
        </Card>

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
            <Controller
              name="useKnowledgeBase"
              control={control}
              render={({ field }) => (
                <div className="rounded-lg bg-zinc-50 border border-zinc-200 overflow-hidden">
                  <div className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">Use Knowledge Base</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {field.value
                          ? kbPercentage === 100
                            ? 'All questions sourced entirely from your uploaded documents'
                            : `${kbPercentage}% of questions from uploaded documents`
                          : 'Include questions from uploaded documents'}
                      </p>
                    </div>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </div>
                  {field.value && (
                    <div className="px-3 pb-3 border-t border-zinc-200 pt-2.5">
                      <p className="text-xs text-zinc-500 mb-2">Knowledge base coverage</p>
                      <div className="flex gap-1.5">
                        {[25, 50, 75, 100].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setKbPercentage(pct)}
                            className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                              kbPercentage === pct
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white border border-zinc-200 text-zinc-600 hover:border-indigo-300 hover:text-indigo-600'
                            }`}
                          >
                            {pct}%{pct === 100 ? ' (Full KB)' : ''}
                          </button>
                        ))}
                      </div>
                      {kbPercentage === 100 && (
                        <p className="text-xs text-indigo-600 mt-2 leading-snug">
                          All 30 questions will be based on your uploaded documents. Claude will expand depth if content is limited.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            />
          </CardContent>
        </Card>

        <Button
          type="submit"
          disabled={isSubmitting || quotaExhausted}
          className="w-full bg-indigo-600 hover:bg-indigo-700 h-11 text-base font-medium disabled:opacity-60"
        >
          {isSubmitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Starting generation...</>
          ) : quotaExhausted ? (
            <><AlertTriangle className="w-4 h-4" /> Monthly Limit Reached</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate Interview Kit{quota && !quota.isUnlimited ? ` (${quota.remaining} left)` : ''}</>
          )}
        </Button>
      </form>
    </div>
  );
}
