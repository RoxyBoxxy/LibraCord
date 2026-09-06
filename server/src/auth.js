import { createHash,randomBytes,scrypt as scryptCallback,timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { createSession,deleteSession,findUserBySession } from './db.js'

const scrypt=promisify(scryptCallback)
const COOKIE='libracord_session'
export async function hashPassword(password){const salt=randomBytes(16);const derived=await scrypt(password,salt,64);return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`}
export async function verifyPassword(password,stored){try{const[,saltHex,hashHex]=stored.split(':');const expected=Buffer.from(hashHex,'hex'),actual=await scrypt(password,Buffer.from(saltHex,'hex'),expected.length);return timingSafeEqual(expected,actual)}catch{return false}}
const hashToken=token=>createHash('sha256').update(token).digest('hex')
export function readToken(req){const cookies=Object.fromEntries(String(req.headers.cookie||'').split(';').map(item=>item.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2));return cookies[COOKIE]||null}
export function getUser(req){const token=readToken(req);return token?findUserBySession(hashToken(token)):null}
export function startSession(res,userId){const token=randomBytes(32).toString('base64url'),expires=new Date(Date.now()+30*24*60*60*1000);createSession(hashToken(token),userId,expires.toISOString());res.cookie(COOKIE,token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',expires});return token}
export function endSession(req,res){const token=readToken(req);if(token)deleteSession(hashToken(token));res.clearCookie(COOKIE,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/'})}
export function requireUser(req,res,next){const user=getUser(req);if(!user)return res.status(401).json({error:'Authentication required'});if(user.suspended)return res.status(403).json({error:'Account suspended'});req.user=user;next()}
 
export function requireAdmin(req,res,next){return requireUser(req,res,()=>['owner','admin'].includes(req.user.role)?next():res.status(403).json({error:'Administrator access required'}))}
