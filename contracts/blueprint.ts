import type {Project} from './projects';
import type {ProjectModule} from './modules';
export type BlueprintIssue={moduleId:string;module:string;section:string;path:string;message:string};
export type ProjectBlueprint={format:'codeitz.project-blueprint';version:1;owner:string;generatedAt:string;fingerprint:string;readyForCoding:boolean;ownerApproved:boolean;project:Pick<Project,'owner'|'name'|'purpose'|'active'>;modules:ProjectModule[];issues:BlueprintIssue[]};
