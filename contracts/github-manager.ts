export type RepositoryFile={path:string;previousPath?:string;index:string;worktree:string;status:string};
export type GitRepository={id:string;name:string;path:string;url:string|null;branch:string;upstream:string|null;ahead:number;behind:number;state:'clean'|'modified'|'conflict'|'error';staged:number;modified:number;untracked:number;conflicts:number;files:RepositoryFile[];filesTruncated:boolean;error?:string};
export type RepositoriesOverview={repositories:GitRepository[];checkedAt:string;warnings:string[];syncNote:string};
export type RepositoryReview={repository:GitRepository;head:string;token:string};
export type FilePreview={path:string;staged:string;working:string;content:string|null;binary:boolean};
export type GitActionResult={message:string;commit?:string};
