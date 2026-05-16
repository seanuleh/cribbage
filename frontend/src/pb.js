import PocketBase from 'pocketbase'
const pb = new PocketBase('/')
pb.autoCancellation(false)
export default pb
